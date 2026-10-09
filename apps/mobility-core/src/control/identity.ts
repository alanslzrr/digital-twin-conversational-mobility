import { getAuth } from "../better-auth";
import { database } from "../database";
import { ControlError } from "./errors";
import type { ControlSql } from "./secrets";

export type ControlIdentity = {
  id: string;
  authId: string;
  sessionId: string;
  label: string;
  email: string;
  role: "admin" | "evaluator";
  mfa: boolean;
  twoFactorEnabled?: boolean;
  reauthenticated: boolean;
};
export async function controlIdentity(
  headers: Headers,
): Promise<ControlIdentity> {
  const session = await getAuth().api.getSession({ headers });
  if (!session) throw new ControlError("authentication_required", 401);
  const [row] =
    await database()`SELECT e.id,e.label,u.email,u.role,u."twoFactorEnabled" AS enrolled,(u."twoFactorEnabled" AND EXISTS(SELECT 1 FROM control_mfa f WHERE f.session_id=${session.session.id})) AS mfa,
    EXISTS(SELECT 1 FROM control_reauth r WHERE r.session_id=${session.session.id} AND r.expires_at>now()) AS reauthenticated
    FROM evaluator e JOIN auth_user u ON u.id=e.auth_user_id
    WHERE e.auth_user_id=${session.user.id} AND e.enabled AND e.expires_at>now() AND e.account_state='active' AND NOT u.banned`;
  if (!row) throw new ControlError("authentication_required", 401);
  return {
    id: row.id,
    authId: session.user.id,
    sessionId: session.session.id,
    label: row.label,
    email: row.email,
    role: row.role,
    mfa: row.mfa,
    twoFactorEnabled: row.enrolled,
    reauthenticated: row.reauthenticated,
  };
}
export function requireAdmin(identity: ControlIdentity, sensitive = true) {
  if (identity.role !== "admin") throw new ControlError("access_denied", 403);
  if (!identity.mfa) throw new ControlError("mfa_required", 403);
  if (sensitive && !identity.reauthenticated)
    throw new ControlError("reauth_required", 403);
}
export async function requirePrincipal(sql: ControlSql, principalId: string) {
  const [row] =
    await sql`SELECT e.id FROM evaluator e JOIN auth_user u ON u.id=e.auth_user_id
    WHERE e.id=${principalId} AND e.enabled AND e.expires_at>now() AND e.account_state='active' AND NOT u.banned`;
  if (!row) throw new ControlError("authentication_required", 401);
}
export async function requireSession(
  sql: ControlSql,
  principalId: string,
  sessionId: string,
) {
  await requirePrincipal(sql, principalId);
  const [row] =
    await sql`SELECT session_id FROM evaluation_session WHERE session_id=${sessionId}
    AND evaluator_id=${principalId} AND revoked_at IS NULL AND expires_at>now()`;
  if (!row) throw new ControlError("access_denied", 403);
}
export async function audit(
  sql: ControlSql,
  actorId: string | null,
  action: string,
  targetId: string | null = null,
  details: Record<string, string | number | boolean | null> = {},
) {
  // Deliberately no free-form payload: no keys, links, passwords or conversation content.
  await sql`INSERT INTO control_audit(actor_id,action,target_id,details) VALUES(${actorId},${action},${targetId},${sql.json(details)})`;
}
export async function rateLimit(
  sql: ControlSql,
  key: string,
  limit: number,
  seconds: number,
) {
  const [row] = await sql`INSERT INTO control_rate(key,window_start,count)
    VALUES(${key},to_timestamp(floor(extract(epoch FROM now())/${seconds})*${seconds}),1)
    ON CONFLICT(key,window_start) DO UPDATE SET count=control_rate.count+1 RETURNING count`;
  if (!row || row.count > limit)
    throw new ControlError("rate_limited", 429, seconds);
}

/** Recheck after the control-plane lock: a concurrently revoked session/role is not authority. */
export async function refreshIdentity(
  sql: ControlSql,
  identity: ControlIdentity,
): Promise<ControlIdentity> {
  const [row] =
    await sql`SELECT u.role,u."twoFactorEnabled" AS enrolled,(u."twoFactorEnabled" AND EXISTS(SELECT 1 FROM control_mfa f WHERE f.session_id=s.id)) AS mfa,
    EXISTS(SELECT 1 FROM control_reauth r WHERE r.session_id=s.id AND r.expires_at>now()) AS reauthenticated
    FROM auth_session s JOIN auth_user u ON u.id=s."userId" JOIN evaluator e ON e.auth_user_id=u.id
    WHERE s.id=${identity.sessionId} AND e.id=${identity.id} AND s."expiresAt">now() AND e.enabled AND e.expires_at>now() AND e.account_state='active' AND NOT u.banned`;
  if (!row) throw new ControlError("authentication_required", 401);
  return {
    ...identity,
    role: row.role,
    mfa: row.mfa,
    twoFactorEnabled: row.enrolled,
    reauthenticated: row.reauthenticated,
  };
}
