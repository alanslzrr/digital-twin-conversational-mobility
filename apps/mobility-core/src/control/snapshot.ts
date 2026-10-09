import { type ControlSnapshot, controlSettings } from "@mobility/contracts";
import { database } from "../database";
import { type ControlIdentity, requireAdmin } from "./identity";

export async function readSettings() {
  const [row] =
    await database()`SELECT capacity,global_concurrency AS "globalConcurrency",user_concurrency AS "userConcurrency",
    requests_per_minute AS "requestsPerMinute",requests_per_day AS "requestsPerDay",input_tokens_per_session AS "inputTokensPerSession",
    output_tokens_per_session AS "outputTokensPerSession",output_tokens_per_call AS "outputTokensPerCall" FROM control_settings`;
  return controlSettings.parse(row);
}
export async function snapshot(
  identity: ControlIdentity,
  admin: boolean,
): Promise<ControlSnapshot> {
  if (admin) requireAdmin(identity, false);
  const sql = database();
  // Explicit projections: never expose rows containing ciphertext, auth sessions or mail links.
  const [
    settings,
    providers,
    models,
    credentials,
    grants,
    pools,
    users,
    attempts,
    mail,
    audit,
    totals,
    preference,
    consumption,
  ] = await Promise.all([
    readSettings(),
    sql`SELECT id,profile,enabled FROM llm_provider WHERE ${admin} OR enabled ORDER BY profile->>'name' LIMIT 200`,
    sql`SELECT m.id,m.profile,m.enabled,m.version FROM llm_model m JOIN llm_provider p ON p.id=m.provider_id
      WHERE ${admin} OR (m.enabled AND p.enabled) ORDER BY m.profile->>'name' LIMIT 1000`,
    sql`SELECT c.id,c.provider_id AS "providerId",c.owner_id AS "ownerId",c.alias,c.origin,c.version,c.enabled,
      c.deleted_at IS NOT NULL AS deleted,c.created_at AS "createdAt",v.fingerprint FROM llm_credential c
      JOIN llm_credential_version v ON v.credential_id=c.id AND v.version=c.version
      WHERE ${admin} OR c.owner_id=${identity.id} ORDER BY c.created_at DESC LIMIT 500`,
    sql`WITH pool_totals AS (SELECT pool_id,COALESCE(sum(exposure_micros),0) AS exposure FROM llm_accounting GROUP BY pool_id),
      grant_totals AS (SELECT grant_id,COALESCE(sum(exposure_micros-pending_micros),0) AS used,COALESCE(sum(pending_micros),0) AS reserved,
        count(*) FILTER(WHERE state<>'not_sent') AS calls,
        COALESCE(sum(CASE WHEN state='not_sent' THEN 0 ELSE COALESCE((usage->>'inputTokens')::bigint,reserved_input) END),0) AS input,
        COALESCE(sum(CASE WHEN state='not_sent' THEN 0 ELSE COALESCE((usage->>'outputTokens')::bigint,reserved_output) END),0) AS output
        FROM llm_accounting GROUP BY grant_id)
      SELECT g.id,g.user_id AS "userId",g.pool_id AS "poolId",g.model_ids AS "modelIds",g.budget_micros::float8 AS "budgetMicros",
        g.expires_at AS "expiresAt",g.enabled,g.input_token_limit::float8 AS "inputTokenLimit",g.output_token_limit::float8 AS "outputTokenLimit",g.call_limit AS "callLimit",g.concurrency_limit AS "concurrencyLimit",
        COALESCE(t.used,0)::float8 AS "usedMicros",COALESCE(t.reserved,0)::float8 AS "reservedMicros",COALESCE(t.calls,0)::integer AS calls,
        GREATEST(0,LEAST(g.budget_micros-COALESCE(t.used+t.reserved,0),p.budget_micros-COALESCE(pt.exposure,0)))::float8 AS "availableMicros",
        (COALESCE(t.used+t.reserved,0)>=g.budget_micros*0.8 OR COALESCE(pt.exposure,0)>=p.budget_micros*0.8) AS "budgetWarning",
        CASE WHEN NOT g.enabled OR NOT p.enabled THEN 'suspended'
          WHEN LEAST(g.expires_at,p.expires_at)<=now() THEN 'expired'
          WHEN COALESCE(t.used+t.reserved,0)>=g.budget_micros OR COALESCE(pt.exposure,0)>=p.budget_micros OR COALESCE(t.calls,0)>=g.call_limit
            OR COALESCE(t.input,0)>=g.input_token_limit OR COALESCE(t.output,0)>=g.output_token_limit THEN 'exhausted'
          ELSE 'active' END AS status
      FROM llm_grant g JOIN llm_pool p ON p.id=g.pool_id LEFT JOIN pool_totals pt ON pt.pool_id=p.id LEFT JOIN grant_totals t ON t.grant_id=g.id
      WHERE ${admin} OR g.user_id=${identity.id} ORDER BY g.expires_at DESC LIMIT 500`,
    admin
      ? sql`SELECT p.id,p.name,p.credential_id AS "credentialId",p.budget_micros::float8 AS "budgetMicros",p.expires_at AS "expiresAt",p.enabled,
      COALESCE(sum(a.exposure_micros-a.pending_micros),0)::float8 AS "usedMicros",COALESCE(sum(a.pending_micros),0)::float8 AS "reservedMicros"
      FROM llm_pool p LEFT JOIN llm_accounting a ON a.pool_id=p.id GROUP BY p.id LIMIT 500`
      : [],
    admin
      ? sql`SELECT e.id,e.label,u.email,u.role,e.enabled,e.expires_at AS "expiresAt",e.account_state AS state
      FROM evaluator e JOIN auth_user u ON u.id=e.auth_user_id ORDER BY e.created_at DESC LIMIT 500`
      : [],
    sql`SELECT id,principal_id AS "userId",session_id AS "sessionId",turn_id AS "turnId",model_id AS "modelId",provider_id AS "providerId",grant_id AS "grantId",
      purpose,state,reserved_micros::float8 AS "reservedMicros",accounted_micros::float8 AS "costMicros",
      CASE WHEN EXISTS(SELECT 1 FROM llm_reconciliation r WHERE r.attempt_id=a.id) THEN 'operator' ELSE cost_source END AS "costSource",
      usage,error_code AS "errorCode",created_at AS "createdAt",duration_ms AS "durationMs" FROM llm_accounting a
      WHERE ${admin} OR principal_id=${identity.id} ORDER BY created_at DESC LIMIT 200`,
    admin
      ? sql`SELECT id,user_id AS "userId",state,attempts,created_at AS "createdAt" FROM account_mail ORDER BY created_at DESC LIMIT 100`
      : [],
    admin
      ? sql`SELECT id,actor_id AS "actorId",action,details,target_id AS "targetId",created_at AS "createdAt" FROM control_audit ORDER BY created_at DESC LIMIT 200`
      : [],
    sql`SELECT COALESCE(sum(exposure_micros-pending_micros),0)::float8 AS "usedMicros",COALESCE(sum(pending_micros),0)::float8 AS "reservedMicros",
      COALESCE(sum((usage->>'inputTokens')::bigint),0)::float8 AS "inputTokens",COALESCE(sum((usage->>'outputTokens')::bigint),0)::float8 AS "outputTokens",
      count(*) FILTER(WHERE state='unknown' AND accounted_micros IS NULL)::integer AS "unknownAttempts",
      count(*) FILTER(WHERE state<>'not_sent')::integer AS calls FROM llm_accounting WHERE ${admin} OR principal_id=${identity.id}`,
    sql`SELECT selection FROM llm_preference WHERE principal_id=${identity.id}`,
    sql`SELECT principal_id AS "userId",provider_id AS "providerId",model_id AS "modelId",
      COALESCE(sum(exposure_micros-pending_micros),0)::float8 AS "usedMicros",COALESCE(sum(pending_micros),0)::float8 AS "reservedMicros",
      COALESCE(sum((usage->>'inputTokens')::bigint),0)::float8 AS "inputTokens",COALESCE(sum((usage->>'outputTokens')::bigint),0)::float8 AS "outputTokens",
      count(*) FILTER(WHERE state<>'not_sent')::integer AS calls FROM llm_accounting WHERE ${admin} OR principal_id=${identity.id}
      GROUP BY principal_id,provider_id,model_id ORDER BY sum(exposure_micros) DESC`,
  ]);
  return JSON.parse(
    JSON.stringify({
      identity: {
        id: identity.id,
        label: identity.label,
        email: identity.email,
        role: identity.role,
        mfa: identity.mfa,
        twoFactorEnabled: identity.twoFactorEnabled ?? identity.mfa,
        reauthenticated: identity.reauthenticated,
      },
      settings,
      providers: providers.map((r) => ({
        ...r.profile,
        id: r.id,
        enabled: r.enabled,
      })),
      models: models.map((r) => ({
        ...r.profile,
        id: r.id,
        enabled: r.enabled,
        version: r.version,
      })),
      credentials,
      grants,
      pools,
      users,
      attempts,
      mail,
      audit,
      totals: totals[0],
      preference: preference[0]?.selection ?? null,
      consumption,
    }),
  ) as ControlSnapshot;
}
