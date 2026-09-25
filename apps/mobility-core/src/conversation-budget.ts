import { z } from "zod";
import { database } from "./database";

const id = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/);
const common = { principalId: z.uuid(), sessionId: id };
const usage = z
  .object({
    input: z.number().int().nonnegative().max(2_000_000),
    output: z.number().int().nonnegative().max(2_000_000),
    cached: z.number().int().nonnegative().max(2_000_000).nullable(),
  })
  .strict();
export const budgetAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("budget_begin"),
      ...common,
      attemptId: z.uuid(),
      turnId: id,
      stepIndex: z.number().int().min(0).max(7),
      purpose: z.enum(["step", "compaction"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("budget_dispatch"),
      ...common,
      attemptId: z.uuid(),
      inputTokens: z.number().int().positive().max(100_000),
    })
    .strict(),
  z
    .object({
      action: z.literal("budget_finish"),
      ...common,
      attemptId: z.uuid(),
      usage: usage.nullable(),
      notSent: z.boolean(),
    })
    .strict(),
]);
export type BudgetAction = z.infer<typeof budgetAction>;
const denied = (status = 429) => ({
  status,
  body: { error: "conversation_budget_denied" },
});

/** All admission and reconciliation serialize on the campaign row, across workers. */
export async function evaluateBudget(input: BudgetAction) {
  const sql = database();
  return sql.begin(async (tx) => {
    const [campaign] =
      input.action === "budget_begin"
        ? await tx`SELECT * FROM conversation_campaign WHERE enabled FOR UPDATE`
        : await tx`SELECT c.* FROM conversation_campaign c JOIN conversation_attempt a ON a.campaign_id=c.id WHERE a.id=${input.attemptId} FOR UPDATE OF c`;
    if (!campaign) return denied();
    const [clock] =
      await tx`SELECT (extract(epoch FROM clock_timestamp())*1000)::bigint AS ms`;
    const now = Number(clock?.ms);
    if (!Number.isFinite(now)) return denied();
    const [owner] =
      await tx`SELECT s.session_id FROM evaluation_session s JOIN evaluator e ON e.id=s.evaluator_id WHERE s.session_id=${input.sessionId} AND e.id=${input.principalId} AND e.enabled AND e.expires_at>now() AND s.revoked_at IS NULL AND s.expires_at>now() FOR UPDATE OF e,s`;
    if (!owner) return denied(403);
    if (input.action === "budget_begin") {
      if (
        !campaign.enabled ||
        campaign.blocked ||
        new Date(campaign.expires_at).getTime() <= now
      )
        return denied();
      // Ambiguous/crashed calls retain both reservation and concurrency slot. No lease refunds.
      const [totals] = await tx`SELECT count(*)::int AS calls,
        count(*) FILTER (WHERE state IN ('reserved','dispatched','unknown'))::int AS active,
        count(*) FILTER (WHERE evaluator_id=${input.principalId} AND state IN ('reserved','dispatched','unknown'))::int AS evaluator_active,
        coalesce(sum(CASE WHEN state='not_sent' THEN 0 ELSE coalesce(input_tokens,reserved_input) END),0)::int AS input,
        coalesce(sum(CASE WHEN state='not_sent' THEN 0 ELSE coalesce(output_tokens,reserved_output) END),0)::int AS output,
        count(*) FILTER (WHERE session_id=${input.sessionId} AND turn_id=${input.turnId})::int AS turn_calls,
        coalesce(sum(CASE WHEN state='not_sent' THEN 0 ELSE coalesce(input_tokens,reserved_input) END) FILTER (WHERE session_id=${input.sessionId} AND turn_id=${input.turnId}),0)::int AS turn_input,
        coalesce(sum(CASE WHEN state='not_sent' THEN 0 ELSE coalesce(output_tokens,reserved_output) END) FILTER (WHERE session_id=${input.sessionId} AND turn_id=${input.turnId}),0)::int AS turn_output,
        count(*) FILTER (WHERE session_id=${input.sessionId} AND state IN ('reserved','dispatched','unknown'))::int AS session_active,
        min(created_at) FILTER (WHERE session_id=${input.sessionId} AND turn_id=${input.turnId}) AS turn_start
        FROM conversation_attempt WHERE campaign_id=${campaign.id}`;
      const [session] = await tx`SELECT min(created_at) AS started,
        count(*)::int AS calls,
        count(*) FILTER (WHERE state IN ('reserved','dispatched','unknown'))::int AS active,
        coalesce(sum(CASE WHEN state='not_sent' THEN 0 ELSE coalesce(input_tokens,reserved_input) END),0)::int AS input,
        coalesce(sum(CASE WHEN state='not_sent' THEN 0 ELSE coalesce(output_tokens,reserved_output) END),0)::int AS output,
        count(*) FILTER (WHERE turn_id=${input.turnId} AND step_index=${input.stepIndex} AND purpose=${input.purpose})::int AS step_calls
        FROM conversation_attempt WHERE session_id=${input.sessionId}`;
      if (
        !totals ||
        totals.calls >= campaign.call_limit ||
        totals.active >= 5 ||
        totals.evaluator_active >= 1 ||
        totals.session_active > 0 ||
        (session?.active ?? 0) > 0 ||
        (session?.calls ?? 0) >= 30 ||
        (session?.step_calls ?? 0) >= 2 ||
        totals.turn_calls >= 8
      )
        return denied();
      if (
        totals.turn_start &&
        now - new Date(totals.turn_start).getTime() >= 90_000
      )
        return denied();
      if (
        session?.started &&
        now - new Date(session.started).getTime() >= 1_800_000
      )
        return denied();
      const reservedInput = Math.min(
        20_000,
        campaign.input_limit - totals.input,
        100_000 - (session?.input ?? 0),
        50_000 - totals.turn_input,
      );
      const reservedOutput = Math.min(
        2048,
        campaign.output_limit - totals.output,
        10_000 - (session?.output ?? 0),
        4096 - totals.turn_output,
      );
      if (reservedInput <= 0 || reservedOutput <= 0) return denied();
      const deadline = new Date(
        Math.min(
          now + 60_000,
          new Date(campaign.expires_at).getTime(),
          (totals.turn_start ? new Date(totals.turn_start).getTime() : now) +
            90_000,
        ),
      );
      // Duplicate admission must never return another reusable dispatch grant.
      const rows =
        await tx`INSERT INTO conversation_attempt(id,campaign_id,evaluator_id,session_id,turn_id,step_index,purpose,state,reserved_input,reserved_output,deadline,count_requests) VALUES (${input.attemptId},${campaign.id},${input.principalId},${input.sessionId},${input.turnId},${input.stepIndex},${input.purpose},'reserved',${reservedInput},${reservedOutput},${deadline},1) ON CONFLICT DO NOTHING RETURNING id`;
      if (rows.length !== 1) return denied();
      return {
        status: 200,
        body: {
          inputLimit: reservedInput,
          outputLimit: reservedOutput,
          deadline: deadline.toISOString(),
        },
      };
    }
    const [attempt] =
      await tx`SELECT * FROM conversation_attempt WHERE id=${input.attemptId} AND evaluator_id=${input.principalId} AND session_id=${input.sessionId} FOR UPDATE`;
    if (!attempt) return denied(403);
    if (input.action === "budget_dispatch") {
      if (
        !campaign.enabled ||
        campaign.blocked ||
        attempt.state !== "reserved" ||
        new Date(attempt.deadline).getTime() <= now ||
        input.inputTokens > attempt.reserved_input
      )
        return denied();
      await tx`UPDATE conversation_attempt SET state='dispatched',dispatched_at=clock_timestamp(),inference_requests=1,counted_input_tokens=${input.inputTokens} WHERE id=${input.attemptId}`;
      return { status: 200, body: { ok: true } };
    }
    if (input.notSent && input.usage !== null) return denied(409);
    if (["settled", "not_sent", "unknown"].includes(attempt.state)) {
      const same =
        (attempt.state === "not_sent" && input.notSent) ||
        (attempt.state === "unknown" &&
          !input.notSent &&
          input.usage === null) ||
        (attempt.state === "settled" &&
          !input.notSent &&
          input.usage?.input === attempt.input_tokens &&
          input.usage?.output === attempt.output_tokens &&
          input.usage?.cached === attempt.cache_read_tokens);
      return same ? { status: 200, body: { ok: true } } : denied(409);
    }
    if (input.notSent && attempt.state !== "reserved") return denied(409);
    if (input.usage && attempt.state !== "dispatched") return denied(409);
    const state = input.notSent
      ? "not_sent"
      : input.usage
        ? "settled"
        : "unknown";
    if (
      input.usage &&
      (input.usage.input > attempt.reserved_input ||
        input.usage.output > attempt.reserved_output ||
        (input.usage.cached ?? 0) > input.usage.input)
    ) {
      await tx`UPDATE conversation_campaign SET blocked=true WHERE id=${campaign.id}`;
      await tx`UPDATE conversation_attempt SET state='unknown',finished_at=clock_timestamp() WHERE id=${input.attemptId}`;
      return denied(409);
    }
    await tx`UPDATE conversation_attempt SET state=${state},input_tokens=${input.usage?.input ?? null},output_tokens=${input.usage?.output ?? null},cache_read_tokens=${input.usage?.cached ?? null},finished_at=clock_timestamp() WHERE id=${input.attemptId}`;
    return { status: 200, body: { ok: true } };
  });
}
