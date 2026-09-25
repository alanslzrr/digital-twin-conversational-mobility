import { localIngestionEnabled } from "@mobility/domain";
import { z } from "zod";
import { getAuth } from "./better-auth";
import { budgetAction, evaluateBudget } from "./conversation-budget";
import { database } from "./database";

const principal = z.string().uuid();
const session = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/);
export const evaluationAction = z
  .discriminatedUnion("action", [
    z
      .object({
        action: z.literal("identify"),
      })
      .strict(),
    z
      .object({
        action: z.literal("authorize"),
        principalId: principal,
        sessionId: session.optional(),
        consume: z.boolean(),
      })
      .strict(),
    z
      .object({
        action: z.literal("register"),
        principalId: principal,
        sessionId: session,
      })
      .strict(),
    z
      .object({
        action: z.literal("revoke"),
        principalId: principal,
        sessionId: session,
      })
      .strict(),
  ])
  .or(budgetAction);
export type EvaluationAction = z.infer<typeof evaluationAction>;

export async function evaluateAccess(
  input: EvaluationAction,
  headers = new Headers(),
) {
  const budget = budgetAction.safeParse(input);
  if (budget.success) return evaluateBudget(budget.data);
  if (
    input.action === "budget_begin" ||
    input.action === "budget_dispatch" ||
    input.action === "budget_finish"
  )
    throw new Error("Invalid budget action");
  const sql = database();
  if (input.action === "identify") {
    const session = await getAuth().api.getSession({ headers });
    if (!session)
      return { status: 401, body: { error: "authentication_required" } };
    const [user] =
      await sql`SELECT id, label FROM evaluator WHERE auth_user_id = ${session.user.id} AND enabled AND expires_at > now()`;
    return user
      ? { status: 200, body: { principalId: user.id, label: user.label } }
      : { status: 401, body: { error: "evaluator_not_active" } };
  }
  return sql.begin(async (tx) => {
    // Locks one evaluator, serializing concurrent quota updates across instances.
    const [user] =
      await tx`SELECT id FROM evaluator WHERE id = ${input.principalId} AND enabled AND expires_at > now() FOR UPDATE`;
    if (!user) return { status: 401, body: { error: "evaluator_not_active" } };
    if (input.action === "register") {
      await tx`INSERT INTO evaluation_session(session_id, evaluator_id) VALUES (${input.sessionId}, ${input.principalId}) ON CONFLICT DO NOTHING`;
    }
    if (input.sessionId) {
      const [owned] =
        await tx`SELECT session_id FROM evaluation_session WHERE session_id = ${input.sessionId} AND evaluator_id = ${input.principalId} AND revoked_at IS NULL AND expires_at > now()`;
      if (!owned)
        return { status: 403, body: { error: "session_access_denied" } };
    }
    if (input.action === "revoke") {
      await tx`UPDATE evaluation_session SET revoked_at = now() WHERE session_id = ${input.sessionId} AND evaluator_id = ${input.principalId}`;
    }
    if (input.action === "authorize" && input.consume) {
      const counts =
        await tx`SELECT window_kind, requests FROM evaluation_usage WHERE evaluator_id = ${input.principalId} AND ((window_kind = 'minute' AND window_start = date_trunc('minute', now())) OR (window_kind = 'day' AND window_start = date_trunc('day', now())))`;
      if (
        counts.some(
          (row) => row.requests >= (row.window_kind === "minute" ? 6 : 60),
        )
      ) {
        return { status: 429, body: { error: "evaluation_limit_reached" } };
      }
      await tx`INSERT INTO evaluation_usage(evaluator_id, window_start, window_kind, requests) VALUES (${input.principalId}, date_trunc('minute', now()), 'minute', 1), (${input.principalId}, date_trunc('day', now()), 'day', 1) ON CONFLICT (evaluator_id, window_start, window_kind) DO UPDATE SET requests = evaluation_usage.requests + 1`;
      await tx`DELETE FROM evaluation_usage WHERE evaluator_id = ${input.principalId} AND window_start < now() - interval '8 days'`;
      if (localIngestionEnabled(process.env))
        await tx`UPDATE ingestion_activity SET active_until=GREATEST(active_until,now()+interval '30 minutes')`;
    }
    return { status: 200, body: { ok: true } };
  });
}
