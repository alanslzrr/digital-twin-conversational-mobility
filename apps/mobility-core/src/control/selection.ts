import { randomUUID } from "node:crypto";
import {
  type ControlAction,
  type RuntimeLlmAction,
  turnBinding,
} from "@mobility/contracts";
import { verifiedPrices } from "@mobility/domain";
import { database } from "../database";
import { ControlError } from "./errors";
import { rateLimit, requirePrincipal, requireSession } from "./identity";
import type { ControlSql } from "./secrets";

async function resolveFunding(
  sql: ControlSql,
  principalId: string,
  modelId: string,
  credentialId?: string,
  grantId?: string,
) {
  const [model] =
    await sql`SELECT m.id,m.profile,m.version,m.enabled,p.profile AS provider,p.enabled AS provider_enabled
    FROM llm_model m JOIN llm_provider p ON p.id=m.provider_id WHERE m.id=${modelId}`;
  if (
    !model?.enabled ||
    !model.profile.ready ||
    !model.profile.tools ||
    !model.profile.streaming
  )
    throw new ControlError("model_incompatible");
  if (!model.provider_enabled) throw new ControlError("provider_disabled", 403);
  let credential = credentialId;
  if (grantId) {
    const [grant] =
      await sql`SELECT g.*,p.credential_id,p.enabled AS pool_enabled,p.expires_at AS pool_expires
      FROM llm_grant g JOIN llm_pool p ON p.id=g.pool_id WHERE g.id=${grantId} AND g.user_id=${principalId}`;
    if (
      !grant?.enabled ||
      !grant.pool_enabled ||
      new Date(grant.expires_at).getTime() <= Date.now() ||
      new Date(grant.pool_expires).getTime() <= Date.now()
    )
      throw new ControlError("funding_expired", 403);
    if (!grant.model_ids.includes(modelId))
      throw new ControlError("model_denied", 403);
    if (
      !verifiedPrices({
        ...model.profile,
        id: model.id,
        version: model.version,
        enabled: model.enabled,
      })
    )
      throw new ControlError("prices_unverified");
    credential = grant.credential_id;
  }
  if (!credential) throw new ControlError("credential_invalid");
  const [key] =
    await sql`SELECT id,version,provider_id,owner_id,enabled,deleted_at FROM llm_credential WHERE id=${credential}`;
  if (!key?.enabled || key.deleted_at)
    throw new ControlError("credential_disabled", 403);
  if (
    key.provider_id !== model.profile.providerId ||
    (!grantId && key.owner_id !== principalId)
  )
    throw new ControlError("access_denied", 403);
  return { model, key };
}
export async function prepareSelection(
  input: Extract<ControlAction, { action: "selection.prepare" }>,
  principalId: string,
) {
  const selection = input.selection;
  return database().begin(async (tx) => {
    await tx`SELECT singleton FROM control_settings FOR UPDATE`;
    await requirePrincipal(tx, principalId);
    await rateLimit(tx, `selection:${principalId}`, 30, 60);
    if (selection.sessionId) {
      await requireSession(tx, principalId, selection.sessionId);
      const [active] =
        await tx`SELECT id FROM llm_turn WHERE session_id=${selection.sessionId} AND status IN ('active','waiting') AND expires_at>now()`;
      const [attempt] =
        await tx`SELECT id FROM llm_attempt WHERE session_id=${selection.sessionId} AND state IN ('reserved','dispatched') AND deadline>now()`;
      if (active || attempt) throw new ControlError("turn_active", 409);
    }
    const { model, key } = await resolveFunding(
      tx,
      principalId,
      selection.modelId,
      selection.credentialId,
      selection.grantId,
    );
    if (selection.sessionId) {
      const [previous] =
        await tx`SELECT binding FROM llm_turn WHERE session_id=${selection.sessionId} ORDER BY created_at DESC LIMIT 1`;
      if (
        (!previous || previous.binding.providerId !== key.provider_id) &&
        !selection.confirmProviderChange
      )
        throw new ControlError("provider_consent_required", 409);
    }
    const [row] =
      await tx`INSERT INTO llm_selection(principal_id,session_id,model_id,credential_id,credential_version,grant_id,consent_provider_id)
      VALUES(${principalId},${selection.sessionId ?? null},${model.id},${key.id},${key.version},${selection.grantId ?? null},${selection.sessionId && selection.confirmProviderChange ? key.provider_id : null}) RETURNING id`;
    const preference = {
      modelId: selection.modelId,
      ...(selection.grantId
        ? { grantId: selection.grantId }
        : { credentialId: selection.credentialId ?? key.id }),
    };
    await tx`INSERT INTO llm_preference(principal_id,selection) VALUES(${principalId},${tx.json(preference)})
      ON CONFLICT(principal_id) DO UPDATE SET selection=EXCLUDED.selection`;
    return { selectionId: row?.id };
  });
}
export async function runtimeSelection(input: RuntimeLlmAction) {
  return database().begin(async (tx) => {
    const [settings] = await tx`SELECT * FROM control_settings FOR UPDATE`;
    if (!settings) throw new ControlError("service_unavailable", 503);
    await requirePrincipal(tx, input.principalId);
    if (input.action === "turn.finish") {
      await requireSession(tx, input.principalId, input.sessionId);
      await tx`UPDATE llm_turn SET status=${input.status} WHERE principal_id=${input.principalId} AND session_id=${input.sessionId} AND turn_id=${input.turnId}
        AND status IN ('active','waiting')`;
      return { ok: true };
    }
    const [selection] =
      await tx`SELECT * FROM llm_selection WHERE id=${input.selectionId} AND principal_id=${input.principalId} FOR UPDATE`;
    if (!selection) throw new ControlError("access_denied", 403);
    if (selection.session_id && selection.session_id !== input.sessionId)
      throw new ControlError("access_denied", 403);
    if (input.action === "turn.bind") {
      const [existing] =
        await tx`SELECT binding FROM llm_turn WHERE session_id=${input.sessionId} AND turn_id=${input.turnId} AND principal_id=${input.principalId}`;
      if (existing) return turnBinding.parse(existing.binding);
    }
    if (
      !selection.bound_turn_id &&
      new Date(selection.expires_at).getTime() <= Date.now()
    )
      throw new ControlError("operation_conflict", 409);
    const { model, key } = await resolveFunding(
      tx,
      input.principalId,
      selection.model_id,
      selection.credential_id,
      selection.grant_id ?? undefined,
    );
    if (key.version !== selection.credential_version)
      throw new ControlError("credential_disabled", 403);
    if (input.action === "session.register") {
      if (!selection.session_id) {
        // Only a newly created session may be associated without historical-context consent.
        // The response guard and turn hook can win this race in either order.
        const inserted =
          await tx`INSERT INTO evaluation_session(session_id,evaluator_id) VALUES(${input.sessionId},${input.principalId}) ON CONFLICT DO NOTHING RETURNING session_id`;
        if (!inserted.length)
          throw new ControlError("provider_consent_required", 409);
        await tx`UPDATE llm_selection SET session_id=${input.sessionId},initial_session_id=${input.sessionId} WHERE id=${selection.id}`;
      }
      await requireSession(tx, input.principalId, input.sessionId);
      return { ok: true };
    }
    if (input.sessionId) {
      const [session] =
        await tx`SELECT session_id FROM evaluation_session WHERE session_id=${input.sessionId}`;
      if (session) {
        await requireSession(tx, input.principalId, input.sessionId);
        const [previous] =
          await tx`SELECT selection_id,binding,status,expires_at FROM llm_turn WHERE session_id=${input.sessionId} ORDER BY created_at DESC LIMIT 1`;
        if (
          previous &&
          ["active", "waiting"].includes(previous.status) &&
          new Date(previous.expires_at).getTime() > Date.now() &&
          previous.selection_id !== selection.id
        )
          throw new ControlError("turn_active", 409);
        if (
          ((!previous && selection.initial_session_id !== input.sessionId) ||
            (previous && previous.binding.providerId !== key.provider_id)) &&
          (selection.consent_provider_id !== key.provider_id ||
            selection.session_id !== input.sessionId)
        )
          throw new ControlError("provider_consent_required", 409);
      }
    }
    if (input.action === "selection.validate") return { ok: true };
    // Trusted channel identity closes the create-response registration race.
    await tx`INSERT INTO evaluation_session(session_id,evaluator_id) VALUES(${input.sessionId},${input.principalId}) ON CONFLICT DO NOTHING`;
    await requireSession(tx, input.principalId, input.sessionId);
    const [busy] =
      await tx`SELECT count(*)::integer AS total,count(*) FILTER(WHERE principal_id=${input.principalId})::integer AS own,count(*) FILTER(WHERE session_id=${input.sessionId})::integer AS session_count
      FROM llm_turn WHERE status IN ('active','waiting') AND expires_at>now()`;
    if (
      busy &&
      (busy.session_count > 0 ||
        busy.total >= settings.global_concurrency ||
        busy.own >= settings.user_concurrency)
    )
      throw new ControlError("turn_active", 409);
    const binding = turnBinding.parse({
      id: randomUUID(),
      principalId: input.principalId,
      sessionId: input.sessionId,
      turnId: input.turnId,
      providerId: key.provider_id,
      providerName: model.provider.name,
      model: {
        ...model.profile,
        id: model.id,
        version: model.version,
        enabled: model.enabled,
      },
      credentialId: key.id,
      credentialVersion: key.version,
      grantId: selection.grant_id,
      outputLimit: Math.min(
        settings.output_tokens_per_call,
        model.profile.maxOutputTokens,
      ),
      policyVersion: settings.version,
      policy: {
        capacity: settings.capacity,
        globalConcurrency: settings.global_concurrency,
        userConcurrency: settings.user_concurrency,
        requestsPerMinute: settings.requests_per_minute,
        requestsPerDay: settings.requests_per_day,
        inputTokensPerSession: settings.input_tokens_per_session,
        outputTokensPerSession: settings.output_tokens_per_session,
        outputTokensPerCall: settings.output_tokens_per_call,
      },
    });
    await tx`INSERT INTO llm_turn(id,principal_id,session_id,turn_id,selection_id,binding)
      VALUES(${binding.id},${input.principalId},${input.sessionId},${input.turnId},${selection.id},${tx.json(binding)})`;
    await tx`UPDATE llm_selection SET session_id=${input.sessionId},bound_turn_id=${input.turnId} WHERE id=${selection.id}`;
    return binding;
  });
}
export async function currentSelection(principalId: string, sessionId: string) {
  const sql = database();
  await requireSession(sql, principalId, sessionId);
  const [row] =
    await sql`SELECT selection_id,binding,status FROM llm_turn WHERE principal_id=${principalId} AND session_id=${sessionId} ORDER BY created_at DESC LIMIT 1`;
  return row
    ? {
        selectionId: row.selection_id,
        binding: turnBinding.parse(row.binding),
        status: row.status,
      }
    : { selectionId: null };
}
