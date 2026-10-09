import { randomUUID } from "node:crypto";
import type { ControlAction } from "@mobility/contracts";
import { verifiedPrices } from "@mobility/domain";
import { database } from "../database";
import { boundedText, ControlError, externallyEnabled } from "./errors";
import {
  audit,
  type ControlIdentity,
  rateLimit,
  refreshIdentity,
  requireAdmin,
  requirePrincipal,
} from "./identity";
import { providerFetch, resolveProvider } from "./network";
import { type ControlSql, secretFingerprint, secretStore } from "./secrets";

export async function credentialOwner(
  sql: ControlSql,
  identity: ControlIdentity,
  id: string,
) {
  const [row] =
    await sql`SELECT * FROM llm_credential WHERE id=${id} AND deleted_at IS NULL FOR UPDATE`;
  if (!row) throw new ControlError("not_found", 404);
  if (row.owner_id !== identity.id) requireAdmin(identity);
  return row;
}
export async function catalogAction(
  input: ControlAction,
  identity: ControlIdentity,
) {
  const sql = database();
  if (input.action === "models.discover") {
    const credential = await sql.begin(async (tx) => {
      await tx`SELECT singleton FROM control_settings FOR UPDATE`;
      identity = await refreshIdentity(tx, identity);
      await rateLimit(tx, `models:${identity.id}`, 6, 60);
      return credentialOwner(tx, identity, input.credentialId);
    });
    // An admin can manage another user's key, but cannot execute requests with it.
    if (credential.owner_id !== identity.id)
      throw new ControlError("access_denied", 403);
    if (!externallyEnabled("LLM"))
      throw new ControlError("feature_disabled", 503);
    const [provider] =
      await sql`SELECT profile FROM llm_provider WHERE id=${credential.provider_id} AND enabled`;
    const [version] =
      await sql`SELECT secret_id FROM llm_credential_version WHERE credential_id=${credential.id} AND version=${credential.version}`;
    if (
      !provider?.profile.modelList ||
      !version?.secret_id ||
      !credential.enabled
    )
      throw new ControlError("model_incompatible");
    const secret = await secretStore.read(
      version.secret_id,
      `credential:${credential.id}:${credential.version}`,
    );
    const response = await providerFetch(
      `${provider.profile.baseUrl.replace(/\/$/, "")}/models`,
      {
        method: "GET",
        headers:
          provider.profile.authentication === "api-key"
            ? { "api-key": secret }
            : { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new ControlError("credential_invalid", 400);
    }
    const result = JSON.parse(await boundedText(response, 1_000_000));
    return {
      models: Array.isArray(result.data)
        ? result.data.slice(0, 1000).flatMap((v: unknown) => {
            if (
              !v ||
              typeof v !== "object" ||
              !("id" in v) ||
              typeof v.id !== "string" ||
              v.id.includes(secret) ||
              !/^[A-Za-z0-9_.:/@+-]{1,200}$/.test(v.id)
            )
              return [];
            return [{ id: v.id, status: "unverified" }];
          })
        : [],
    };
  }
  if (input.action === "provider.create") {
    requireAdmin(identity);
    await resolveProvider(input.provider.baseUrl);
  }
  return sql.begin(async (tx) => {
    await tx`SELECT singleton FROM control_settings FOR UPDATE`;
    identity = await refreshIdentity(tx, identity);
    let id: string | null = null;
    if (
      input.action.startsWith("provider.") ||
      input.action.startsWith("model.") ||
      input.action.startsWith("pool.") ||
      input.action.startsWith("grant.")
    )
      requireAdmin(identity);
    // All mutations share the admission lock.
    switch (input.action) {
      case "provider.create": {
        const [row] =
          await tx`INSERT INTO llm_provider(profile) VALUES(${tx.json(input.provider)}) RETURNING id`;
        id = row?.id;
        break;
      }
      case "provider.toggle":
        await tx`UPDATE llm_provider SET enabled=${input.enabled} WHERE id=${input.id}`;
        id = input.id;
        break;
      case "model.create": {
        const [provider] =
          await tx`SELECT profile FROM llm_provider WHERE id=${input.model.providerId}`;
        if (
          !provider?.profile.protocols.includes(input.model.protocol) ||
          (input.model.ready && (!input.model.tools || !input.model.streaming))
        )
          throw new ControlError("model_incompatible");
        const [version] =
          await tx`SELECT COALESCE(max(version),0)+1 AS version FROM llm_model WHERE provider_id=${input.model.providerId} AND profile->>'modelId'=${input.model.modelId}`;
        const [row] =
          await tx`INSERT INTO llm_model(provider_id,profile,version,enabled) VALUES(${input.model.providerId},${tx.json(input.model)},${version?.version ?? 1},${input.model.ready}) RETURNING id`;
        id = row?.id;
        break;
      }
      case "model.toggle": {
        const [model] =
          await tx`SELECT profile FROM llm_model WHERE id=${input.id}`;
        if (
          !model ||
          (input.enabled &&
            (!model.profile.ready ||
              !model.profile.tools ||
              !model.profile.streaming))
        )
          throw new ControlError("model_incompatible");
        await tx`UPDATE llm_model SET enabled=${input.enabled} WHERE id=${input.id}`;
        id = input.id;
        break;
      }
      case "credential.create": {
        await rateLimit(tx, `credential:${identity.id}`, 20, 3600);
        const owner = input.ownerId ?? identity.id;
        if (owner !== identity.id) requireAdmin(identity);
        await requirePrincipal(tx, owner);
        const [count] =
          await tx`SELECT count(*)::integer AS count FROM llm_credential WHERE owner_id=${owner} AND deleted_at IS NULL`;
        if ((count?.count ?? 0) >= 20)
          throw new ControlError("rate_limited", 429);
        const [provider] =
          await tx`SELECT id FROM llm_provider WHERE id=${input.providerId}`;
        if (!provider) throw new ControlError("not_found", 404);
        id = randomUUID();
        const secret = await secretStore.put(
          input.secret,
          `credential:${id}:1`,
          tx,
        );
        const fingerprint = await secretFingerprint(input.secret);
        await tx`INSERT INTO llm_credential(id,provider_id,owner_id,alias,origin) VALUES(${id},${input.providerId},${owner},${input.alias},${identity.role === "admin" ? "admin" : "user"})`;
        await tx`INSERT INTO llm_credential_version(credential_id,version,secret_id,fingerprint) VALUES(${id},1,${secret},${fingerprint})`;
        break;
      }
      case "credential.replace": {
        const row = await credentialOwner(tx, identity, input.id);
        const old =
          await tx`SELECT secret_id FROM llm_credential_version WHERE credential_id=${row.id} AND secret_id IS NOT NULL`;
        await tx`UPDATE llm_credential_version SET secret_id=NULL WHERE credential_id=${row.id}`;
        for (const value of old) await secretStore.remove(value.secret_id, tx);
        const version = row.version + 1;
        const secret = await secretStore.put(
          input.secret,
          `credential:${row.id}:${version}`,
          tx,
        );
        await tx`INSERT INTO llm_credential_version(credential_id,version,secret_id,fingerprint) VALUES(${row.id},${version},${secret},${await secretFingerprint(input.secret)})`;
        await tx`UPDATE llm_credential SET version=${version},enabled=true WHERE id=${row.id}`;
        id = row.id;
        break;
      }
      case "credential.toggle":
        await credentialOwner(tx, identity, input.id);
        await tx`UPDATE llm_credential SET enabled=${input.enabled} WHERE id=${input.id}`;
        id = input.id;
        break;
      case "credential.delete": {
        await credentialOwner(tx, identity, input.id);
        await tx`UPDATE llm_credential SET enabled=false,deleted_at=now() WHERE id=${input.id}`;
        const values =
          await tx`SELECT secret_id FROM llm_credential_version WHERE credential_id=${input.id} AND secret_id IS NOT NULL`;
        await tx`UPDATE llm_credential_version SET secret_id=NULL WHERE credential_id=${input.id}`;
        // Delete only this credential's encrypted values, never unrelated orphan records.
        for (const row of values) await secretStore.remove(row.secret_id, tx);
        id = input.id;
        break;
      }
      case "pool.create": {
        const credential = await credentialOwner(
          tx,
          identity,
          input.credentialId,
        );
        if (
          credential.owner_id !== identity.id ||
          credential.origin !== "admin" ||
          !credential.enabled
        )
          throw new ControlError("access_denied", 403);
        if (Date.parse(input.expiresAt) <= Date.now())
          throw new ControlError("funding_expired");
        const [row] =
          await tx`INSERT INTO llm_pool(credential_id,name,budget_micros,expires_at) VALUES(${input.credentialId},${input.name},${input.budgetMicros},${input.expiresAt}) RETURNING id`;
        id = row?.id;
        break;
      }
      case "pool.update":
        await tx`UPDATE llm_pool SET budget_micros=${input.budgetMicros},expires_at=${input.expiresAt},enabled=${input.enabled} WHERE id=${input.id}`;
        id = input.id;
        break;
      case "grant.create":
      case "grant.update": {
        const grant = input.grant;
        const [pool] =
          await tx`SELECT p.*,c.provider_id FROM llm_pool p JOIN llm_credential c ON c.id=p.credential_id WHERE p.id=${grant.poolId}`;
        if (
          !pool ||
          Date.parse(grant.expiresAt) > new Date(pool.expires_at).getTime() ||
          Date.parse(grant.expiresAt) <= Date.now()
        )
          throw new ControlError("funding_expired");
        const models =
          await tx`SELECT id,profile,version,enabled FROM llm_model WHERE id=ANY(${grant.modelIds})`;
        if (
          models.length !== new Set(grant.modelIds).size ||
          models.some(
            (m) =>
              !m.enabled ||
              m.profile.providerId !== pool.provider_id ||
              !verifiedPrices({
                ...m.profile,
                id: m.id,
                enabled: m.enabled,
                version: m.version,
              }),
          )
        )
          throw new ControlError("prices_unverified");
        if (input.action === "grant.create") {
          const [row] =
            await tx`INSERT INTO llm_grant(user_id,pool_id,model_ids,budget_micros,expires_at,input_token_limit,output_token_limit,call_limit,concurrency_limit)
            VALUES(${grant.userId},${grant.poolId},${grant.modelIds},${grant.budgetMicros},${grant.expiresAt},${grant.inputTokenLimit},${grant.outputTokenLimit},${grant.callLimit},${grant.concurrencyLimit}) RETURNING id`;
          id = row?.id;
        } else {
          // Ownership/funder cannot be reassigned: create another grant instead.
          const [row] =
            await tx`UPDATE llm_grant SET model_ids=${grant.modelIds},budget_micros=${grant.budgetMicros},expires_at=${grant.expiresAt},
            input_token_limit=${grant.inputTokenLimit},output_token_limit=${grant.outputTokenLimit},call_limit=${grant.callLimit},concurrency_limit=${grant.concurrencyLimit},enabled=${input.enabled}
            WHERE id=${input.id} AND user_id=${grant.userId} AND pool_id=${grant.poolId} RETURNING id`;
          if (!row) throw new ControlError("not_found", 404);
          id = row.id;
        }
        break;
      }
      default:
        throw new ControlError("invalid_request");
    }
    await audit(
      tx,
      identity.id,
      input.action,
      id,
      input.action === "pool.update"
        ? {
            budgetMicros: input.budgetMicros,
            enabled: input.enabled,
            expiresAt: input.expiresAt,
          }
        : input.action === "grant.update"
          ? {
              budgetMicros: input.grant.budgetMicros,
              enabled: input.enabled,
              expiresAt: input.grant.expiresAt,
              callLimit: input.grant.callLimit,
              concurrencyLimit: input.grant.concurrencyLimit,
              inputTokenLimit: input.grant.inputTokenLimit,
              outputTokenLimit: input.grant.outputTokenLimit,
            }
          : {},
    );
    return { ok: true, id };
  });
}
