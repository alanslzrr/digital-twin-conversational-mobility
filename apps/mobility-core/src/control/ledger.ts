import { createHash, randomUUID } from "node:crypto";
import {
  type LlmUsage,
  type TurnBinding,
  turnBinding,
} from "@mobility/contracts";
import { reservationCost, usageCost, verifiedPrices } from "@mobility/domain";
import { database } from "../database";
import { ControlError } from "./errors";
import { requireSession } from "./identity";

export type DispatchContext = {
  principalId: string;
  sessionId: string;
  turnId: string;
  bindingId: string;
  stepIndex: number;
  purpose: "step" | "compaction";
};
export async function reserveAttempt(context: DispatchContext, body: string) {
  return database().begin(async (tx) => {
    const [settings] = await tx`SELECT * FROM control_settings FOR UPDATE`;
    if (!settings) throw new ControlError("service_unavailable", 503);
    await requireSession(tx, context.principalId, context.sessionId);
    // Only undispatched reservations are refundable. Expired dispatched work remains charged conservatively.
    await tx`UPDATE llm_attempt SET state=CASE WHEN state='reserved' THEN 'not_sent' ELSE 'unknown' END,finished_at=now()
      WHERE state IN ('reserved','dispatched') AND deadline<now()`;
    const [turn] =
      await tx`SELECT binding FROM llm_turn WHERE id=${context.bindingId} AND principal_id=${context.principalId}
      AND session_id=${context.sessionId} AND turn_id=${context.turnId} AND expires_at>now() AND (status IN ('active','waiting') OR ${context.purpose}='compaction')`;
    if (!turn) throw new ControlError("operation_conflict", 409);
    const binding = turnBinding.parse(turn.binding);
    if (context.purpose === "compaction") {
      const [other] =
        await tx`SELECT id FROM llm_turn WHERE principal_id=${context.principalId} AND id<>${binding.id} AND status IN ('active','waiting') AND expires_at>now()`;
      if (other) throw new ControlError("turn_active", 409);
    }
    const logicalKey = `${context.purpose}:${context.stepIndex}`;
    const [duplicate] =
      await tx`SELECT id FROM llm_attempt WHERE binding_id=${binding.id} AND logical_key=${logicalKey}`;
    if (duplicate) throw new ControlError("execution_uncertain", 409);
    const [provider] =
      await tx`SELECT profile FROM llm_provider WHERE id=${binding.providerId} AND enabled`;
    const [model] =
      await tx`SELECT id FROM llm_model WHERE id=${binding.model.id} AND enabled`;
    const [credential] =
      await tx`SELECT v.secret_id FROM llm_credential c JOIN llm_credential_version v ON v.credential_id=c.id AND v.version=c.version
      WHERE c.id=${binding.credentialId} AND c.version=${binding.credentialVersion} AND c.enabled AND c.deleted_at IS NULL`;
    if (!provider || !model) throw new ControlError("provider_disabled", 403);
    if (!credential?.secret_id)
      throw new ControlError("credential_disabled", 403);
    const [counts] =
      await tx`SELECT count(*) FILTER(WHERE state IN ('reserved','dispatched'))::integer AS active,
      count(*) FILTER(WHERE state IN ('reserved','dispatched') AND principal_id=${context.principalId})::integer AS own,
      count(*) FILTER(WHERE session_id=${context.sessionId} AND state<>'not_sent')::integer AS calls,
      COALESCE(sum(CASE WHEN state='not_sent' THEN 0 ELSE COALESCE((usage->>'inputTokens')::bigint,reserved_input) END) FILTER(WHERE session_id=${context.sessionId}),0)::float8 AS input,
      COALESCE(sum(CASE WHEN state='not_sent' THEN 0 ELSE COALESCE((usage->>'outputTokens')::bigint,reserved_output) END) FILTER(WHERE session_id=${context.sessionId}),0)::float8 AS output
      FROM llm_attempt`;
    if (
      !counts ||
      counts.active >=
        Math.min(
          settings.global_concurrency,
          binding.policy.globalConcurrency,
        ) ||
      counts.own >=
        Math.min(settings.user_concurrency, binding.policy.userConcurrency)
    )
      throw new ControlError("turn_active", 409);
    const input = binding.model.contextTokens,
      output = binding.outputLimit;
    if (
      counts.calls >= 30 ||
      counts.input + input >
        Math.min(
          settings.input_tokens_per_session,
          binding.policy.inputTokensPerSession,
        ) ||
      counts.output + output >
        Math.min(
          settings.output_tokens_per_session,
          binding.policy.outputTokensPerSession,
        )
    )
      throw new ControlError("budget_exhausted", 429);
    let reserved = reservationCost(binding.model, output) ?? 0;
    let poolId: string | null = null;
    let deadline = Math.min(
      Date.now() + 60_000,
      new Date(
        (await tx`SELECT expires_at FROM llm_turn WHERE id=${binding.id}`)[0]
          ?.expires_at,
      ).getTime(),
    );
    if (binding.grantId) {
      const [grant] =
        await tx`SELECT g.*,p.credential_id,p.budget_micros AS pool_budget,p.enabled AS pool_enabled,p.expires_at AS pool_expires
        FROM llm_grant g JOIN llm_pool p ON p.id=g.pool_id WHERE g.id=${binding.grantId} AND g.user_id=${context.principalId}`;
      if (
        !grant?.enabled ||
        !grant.pool_enabled ||
        new Date(grant.expires_at).getTime() <= Date.now() ||
        new Date(grant.pool_expires).getTime() <= Date.now()
      )
        throw new ControlError("funding_expired", 403);
      if (
        grant.credential_id !== binding.credentialId ||
        !grant.model_ids.includes(binding.model.id)
      )
        throw new ControlError("model_denied", 403);
      if (!verifiedPrices(binding.model))
        throw new ControlError("prices_unverified");
      reserved = reservationCost(binding.model, output) ?? 0;
      poolId = grant.pool_id;
      const [totals] =
        await tx`SELECT COALESCE(sum(exposure_micros),0)::float8 AS pool,
        COALESCE(sum(exposure_micros) FILTER(WHERE grant_id=${binding.grantId}),0)::float8 AS grant,
        count(*) FILTER(WHERE grant_id=${binding.grantId} AND state<>'not_sent')::integer AS calls,
        count(*) FILTER(WHERE grant_id=${binding.grantId} AND state IN ('reserved','dispatched'))::integer AS concurrent,
        COALESCE(sum(CASE WHEN state='not_sent' THEN 0 ELSE COALESCE((usage->>'inputTokens')::bigint,reserved_input) END) FILTER(WHERE grant_id=${binding.grantId}),0)::float8 AS input,
        COALESCE(sum(CASE WHEN state='not_sent' THEN 0 ELSE COALESCE((usage->>'outputTokens')::bigint,reserved_output) END) FILTER(WHERE grant_id=${binding.grantId}),0)::float8 AS output
        FROM llm_accounting WHERE pool_id=${poolId}`;
      if (
        !totals ||
        totals.pool + reserved > Number(grant.pool_budget) ||
        totals.grant + reserved > Number(grant.budget_micros) ||
        totals.calls >= grant.call_limit ||
        totals.concurrent >= grant.concurrency_limit ||
        totals.input + input > Number(grant.input_token_limit) ||
        totals.output + output > Number(grant.output_token_limit)
      )
        throw new ControlError("budget_exhausted", 429);
      deadline = Math.min(
        deadline,
        new Date(grant.expires_at).getTime(),
        new Date(grant.pool_expires).getTime(),
      );
    } else {
      const [owned] =
        await tx`SELECT id FROM llm_credential WHERE id=${binding.credentialId} AND owner_id=${context.principalId}`;
      if (!owned) throw new ControlError("access_denied", 403);
    }
    const id = randomUUID();
    const hash = createHash("sha256").update(body).digest("hex");
    await tx`INSERT INTO llm_attempt(id,binding_id,logical_key,principal_id,session_id,turn_id,provider_id,model_id,credential_id,credential_version,grant_id,pool_id,purpose,request_hash,state,reserved_micros,reserved_input,reserved_output,price_snapshot,deadline)
      VALUES(${id},${binding.id},${logicalKey},${context.principalId},${context.sessionId},${context.turnId},${binding.providerId},${binding.model.id},${binding.credentialId},${binding.credentialVersion},${binding.grantId},${poolId},${context.purpose},${hash},'reserved',${reserved},${input},${output},${tx.json(binding.model)},${new Date(deadline)})`;
    return {
      id,
      binding,
      secretId: credential.secret_id as string,
      provider: provider.profile as {
        baseUrl: string;
        authentication: "bearer" | "api-key";
      },
      deadline,
    };
  });
}
export async function dispatchAttempt(id: string, binding: TurnBinding) {
  await database().begin(async (tx) => {
    const [settings] = await tx`SELECT * FROM control_settings FOR UPDATE`;
    if (!settings) throw new ControlError("service_unavailable", 503);
    await requireSession(tx, binding.principalId, binding.sessionId);
    const [counts] =
      await tx`SELECT count(*) FILTER(WHERE state IN ('reserved','dispatched'))::integer AS active,
      count(*) FILTER(WHERE state IN ('reserved','dispatched') AND principal_id=${binding.principalId})::integer AS own,
      COALESCE(sum(CASE WHEN state='not_sent' THEN 0 ELSE COALESCE((usage->>'inputTokens')::bigint,reserved_input) END) FILTER(WHERE session_id=${binding.sessionId}),0)::float8 AS input,
      COALESCE(sum(CASE WHEN state='not_sent' THEN 0 ELSE COALESCE((usage->>'outputTokens')::bigint,reserved_output) END) FILTER(WHERE session_id=${binding.sessionId}),0)::float8 AS output
      FROM llm_attempt`;
    if (
      !counts ||
      counts.active >
        Math.min(
          settings.global_concurrency,
          binding.policy.globalConcurrency,
        ) ||
      counts.own >
        Math.min(settings.user_concurrency, binding.policy.userConcurrency)
    )
      throw new ControlError("turn_active", 409);
    if (
      binding.outputLimit > settings.output_tokens_per_call ||
      counts.input >
        Math.min(
          settings.input_tokens_per_session,
          binding.policy.inputTokensPerSession,
        ) ||
      counts.output >
        Math.min(
          settings.output_tokens_per_session,
          binding.policy.outputTokensPerSession,
        )
    )
      throw new ControlError("budget_exhausted", 429);
    if (binding.grantId) {
      if (!verifiedPrices(binding.model))
        throw new ControlError("prices_unverified");
      const [grant] =
        await tx`SELECT g.*,p.budget_micros AS pool_budget FROM llm_grant g JOIN llm_pool p ON p.id=g.pool_id WHERE g.id=${binding.grantId}`;
      if (!grant) throw new ControlError("funding_expired", 403);
      const [totals] =
        await tx`SELECT COALESCE(sum(exposure_micros),0)::float8 AS pool,
        COALESCE(sum(exposure_micros) FILTER(WHERE grant_id=${binding.grantId}),0)::float8 AS grant,
        count(*) FILTER(WHERE grant_id=${binding.grantId} AND state<>'not_sent')::integer AS calls,
        count(*) FILTER(WHERE grant_id=${binding.grantId} AND state IN ('reserved','dispatched'))::integer AS concurrent,
        COALESCE(sum(CASE WHEN state='not_sent' THEN 0 ELSE COALESCE((usage->>'inputTokens')::bigint,reserved_input) END) FILTER(WHERE grant_id=${binding.grantId}),0)::float8 AS input,
        COALESCE(sum(CASE WHEN state='not_sent' THEN 0 ELSE COALESCE((usage->>'outputTokens')::bigint,reserved_output) END) FILTER(WHERE grant_id=${binding.grantId}),0)::float8 AS output
        FROM llm_accounting WHERE pool_id=${grant.pool_id}`;
      if (
        !totals ||
        totals.pool > Number(grant.pool_budget) ||
        totals.grant > Number(grant.budget_micros) ||
        totals.calls > grant.call_limit ||
        totals.concurrent > grant.concurrency_limit ||
        totals.input > Number(grant.input_token_limit) ||
        totals.output > Number(grant.output_token_limit)
      )
        throw new ControlError("budget_exhausted", 429);
    }
    const rows =
      await tx`UPDATE llm_attempt a SET state='dispatched' WHERE a.id=${id} AND a.state='reserved' AND a.deadline>now()
      AND EXISTS(SELECT 1 FROM llm_credential c WHERE c.id=a.credential_id AND c.version=a.credential_version AND c.enabled AND c.deleted_at IS NULL)
      AND EXISTS(SELECT 1 FROM llm_provider p WHERE p.id=a.provider_id AND p.enabled)
      AND EXISTS(SELECT 1 FROM llm_model m WHERE m.id=a.model_id AND m.enabled)
      AND (a.grant_id IS NULL OR EXISTS(SELECT 1 FROM llm_grant g JOIN llm_pool p ON p.id=g.pool_id
        WHERE g.id=a.grant_id AND g.enabled AND p.enabled AND g.expires_at>now() AND p.expires_at>now() AND a.model_id=ANY(g.model_ids))) RETURNING id`;
    if (!rows.length) throw new ControlError("operation_conflict", 409);
  });
}
export async function settleAttempt(
  id: string,
  binding: TurnBinding,
  usage: LlmUsage | null,
  responseId: string | null,
  errorCode: string | null,
  duration: number,
) {
  await database().begin(async (tx) => {
    await tx`SELECT singleton FROM control_settings FOR UPDATE`;
    const [attempt] =
      await tx`SELECT state,reserved_micros FROM llm_attempt WHERE id=${id} FOR UPDATE`;
    if (
      !attempt ||
      !["reserved", "dispatched", "unknown"].includes(attempt.state)
    )
      return;
    const notSent = attempt.state === "reserved";
    const cost = !notSent && usage ? usageCost(binding.model, usage) : null;
    await tx`UPDATE llm_attempt SET state=${notSent ? "not_sent" : usage ? "settled" : "unknown"},usage=${usage ? tx.json(usage) : null},
      cost_micros=${cost},cost_source=${usage?.reportedCostMicros !== null && usage?.reportedCostMicros !== undefined ? "provider" : cost !== null ? "rate_card" : "unknown"},
      provider_response_id=${responseId},error_code=${errorCode},duration_ms=${Math.min(2_147_483_647, Math.max(0, Math.round(duration)))},finished_at=now() WHERE id=${id}`;
    if (
      binding.grantId &&
      ((cost !== null && cost > Number(attempt.reserved_micros)) ||
        (usage &&
          (usage.inputTokens > binding.model.contextTokens ||
            usage.outputTokens > binding.outputLimit)))
    ) {
      await tx`UPDATE llm_pool SET enabled=false WHERE id=(SELECT pool_id FROM llm_grant WHERE id=${binding.grantId})`;
    }
    if (errorCode === "credential_invalid")
      await tx`UPDATE llm_credential SET enabled=false WHERE id=${binding.credentialId} AND version=${binding.credentialVersion}`;
  });
}
