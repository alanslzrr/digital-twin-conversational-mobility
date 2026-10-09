import type { ControlAction } from "@mobility/contracts";
import { getAuth } from "../better-auth";
import { database } from "../database";
import { ControlError } from "./errors";
import {
  audit,
  type ControlIdentity,
  rateLimit,
  refreshIdentity,
  requireAdmin,
} from "./identity";

export async function accountAction(
  input: ControlAction,
  identity: ControlIdentity,
  headers: Headers,
) {
  const sql = database();
  if (input.action === "reauth") {
    requireAdmin(identity, false);
    await rateLimit(sql, `reauth:${identity.id}`, 5, 300);
    try {
      await getAuth().api.verifyPassword({
        body: { password: input.password },
        headers,
      });
      await getAuth().api.verifyTOTP({
        body: { code: input.code, trustDevice: false },
        headers,
      });
    } catch {
      throw new ControlError("access_denied", 403);
    }
    await sql`INSERT INTO control_reauth(session_id,expires_at) VALUES(${identity.sessionId},now()+interval '5 minutes')
      ON CONFLICT(session_id) DO UPDATE SET expires_at=EXCLUDED.expires_at`;
    await audit(sql, identity.id, "account.reauthenticated");
    return { ok: true };
  }
  requireAdmin(identity);
  if (input.action === "user.invite") {
    let created: string | undefined;
    let principalId: string | undefined;
    try {
      await sql.begin(async (tx) => {
        const [settings] =
          await tx`SELECT capacity FROM control_settings FOR UPDATE`;
        requireAdmin(await refreshIdentity(tx, identity));
        const [count] =
          await tx`SELECT count(*)::integer AS count FROM evaluator WHERE enabled AND expires_at>now() AND (account_state='active' OR invitation_expires_at>now())`;
        if (!settings || !count || count.count >= settings.capacity)
          throw new ControlError("capacity_reached", 409);
        const result = await getAuth().api.createUser({
          headers,
          body: { name: input.name, email: input.email.toLowerCase() },
        });
        created = result.user.id;
        const [user] =
          await tx`INSERT INTO evaluator(label,auth_user_id,account_state,invitation_expires_at) VALUES(${input.name},${created},'pending',now()+interval '1 hour') RETURNING id`;
        principalId = user?.id;
        await audit(tx, identity.id, input.action, principalId ?? null);
      });
    } catch (error) {
      if (created)
        await sql`DELETE FROM auth_user WHERE id=${created} AND NOT EXISTS(SELECT 1 FROM evaluator WHERE auth_user_id=${created})`;
      throw error;
    }
    // A failed delivery leaves an identifiable pending account; never create a duplicate on retry.
    await getAuth().api.requestPasswordReset({
      body: { email: input.email.toLowerCase() },
    });
    return { ok: true, id: principalId };
  }
  if (input.action === "user.recover") {
    const user = await sql.begin(async (tx) => {
      await tx`SELECT singleton FROM control_settings FOR UPDATE`;
      requireAdmin(await refreshIdentity(tx, identity));
      const [row] =
        await tx`SELECT u.email FROM evaluator e JOIN auth_user u ON u.id=e.auth_user_id WHERE e.id=${input.id} AND e.enabled AND e.expires_at>now()`;
      if (row) await audit(tx, identity.id, input.action, input.id);
      return row;
    });
    if (!user) throw new ControlError("not_found", 404);
    await getAuth().api.requestPasswordReset({ body: { email: user.email } });
    return { ok: true };
  }
  return sql.begin(async (tx) => {
    const [settings] = await tx`SELECT * FROM control_settings FOR UPDATE`;
    requireAdmin(await refreshIdentity(tx, identity));
    if (input.action === "user.update") {
      const [user] =
        await tx`SELECT e.auth_user_id,u.role,e.enabled,e.expires_at,e.account_state,e.invitation_expires_at FROM evaluator e JOIN auth_user u ON u.id=e.auth_user_id WHERE e.id=${input.id} FOR UPDATE OF e,u`;
      if (!user) throw new ControlError("not_found", 404);
      const wasCounted =
        user.enabled &&
        new Date(user.expires_at).getTime() > Date.now() &&
        (user.account_state === "active" ||
          (user.invitation_expires_at &&
            new Date(user.invitation_expires_at).getTime() > Date.now()));
      const willCount =
        input.enabled &&
        Date.parse(input.expiresAt) > Date.now() &&
        (user.account_state === "active" ||
          (user.invitation_expires_at &&
            new Date(user.invitation_expires_at).getTime() > Date.now()));
      if (!wasCounted && willCount) {
        const [count] =
          await tx`SELECT count(*)::integer AS count FROM evaluator WHERE enabled AND expires_at>now() AND (account_state='active' OR invitation_expires_at>now())`;
        if (
          !settings ||
          (count?.count ?? settings.capacity) >= settings.capacity
        )
          throw new ControlError("capacity_reached", 409);
      }
      if (
        user.role === "admin" &&
        (input.role !== "admin" ||
          !input.enabled ||
          Date.parse(input.expiresAt) <= Date.now())
      ) {
        const [others] =
          await tx`SELECT count(*)::integer AS count FROM evaluator e JOIN auth_user u ON u.id=e.auth_user_id
          WHERE u.role='admin' AND e.id<>${input.id} AND e.enabled AND e.account_state='active' AND e.expires_at>now()`;
        if (!others?.count) throw new ControlError("last_admin", 409);
      }
      await tx`UPDATE evaluator SET enabled=${input.enabled},expires_at=${input.expiresAt} WHERE id=${input.id}`;
      await tx`UPDATE auth_user SET role=${input.role},"updatedAt"=now() WHERE id=${user.auth_user_id}`;
      await tx`DELETE FROM auth_session WHERE "userId"=${user.auth_user_id}`;
      await audit(tx, identity.id, input.action, input.id, {
        role: input.role,
        enabled: input.enabled,
        expiresAt: input.expiresAt,
      });
    } else if (input.action === "settings.update") {
      const v = input.settings;
      const [count] =
        await tx`SELECT count(*)::integer AS count FROM evaluator WHERE enabled AND expires_at>now() AND (account_state='active' OR invitation_expires_at>now())`;
      if ((count?.count ?? 0) > v.capacity)
        throw new ControlError("capacity_reached", 409);
      await tx`UPDATE control_settings SET version=version+1,capacity=${v.capacity},global_concurrency=${v.globalConcurrency},user_concurrency=${v.userConcurrency},
        requests_per_minute=${v.requestsPerMinute},requests_per_day=${v.requestsPerDay},input_tokens_per_session=${v.inputTokensPerSession},
        output_tokens_per_session=${v.outputTokensPerSession},output_tokens_per_call=${v.outputTokensPerCall}`;
      await audit(tx, identity.id, input.action, null, { ...v });
    } else if (input.action === "attempt.reconcile") {
      const [attempt] =
        await tx`SELECT id FROM llm_attempt WHERE id=${input.id} AND state='unknown' FOR UPDATE`;
      if (!attempt) throw new ControlError("operation_conflict", 409);
      const inserted =
        await tx`INSERT INTO llm_reconciliation(attempt_id,actor_id,cost_micros,note)
        VALUES(${input.id},${identity.id},${input.costMicros},${input.note}) ON CONFLICT DO NOTHING RETURNING id`;
      if (!inserted.length) throw new ControlError("operation_conflict", 409);
      await audit(tx, identity.id, input.action, input.id);
    } else if (input.action === "mail.retry") {
      const updated =
        await tx`UPDATE account_mail SET available_at=now() WHERE id=${input.id} AND state IN ('pending','failed') AND attempts<3 AND expires_at>now() RETURNING id`;
      if (!updated.length) throw new ControlError("operation_conflict", 409);
      await audit(tx, identity.id, input.action, input.id);
    } else throw new ControlError("invalid_request");
    return { ok: true };
  });
}
