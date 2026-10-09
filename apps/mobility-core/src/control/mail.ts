import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { database } from "../database";
import { ControlError, externallyEnabled } from "./errors";
import { rateLimit } from "./identity";
import { secretStore } from "./secrets";

/** Called only by Better Auth; the reset token is never returned to an administrator. */
export async function queueAccountMail(
  authId: string,
  email: string,
  _callbackUrl: string,
  token: string,
) {
  const sql = database();
  const origin = process.env.EVALUATION_ORIGIN;
  if (!origin) throw new ControlError("mail_unavailable", 503);
  const url = new URL("/account/recover", origin);
  // Fragment avoids proxy logs and referrer propagation. The client removes it immediately.
  url.hash = new URLSearchParams({ token }).toString();
  await sql.begin(async (tx) => {
    const [settings] =
      await tx`SELECT capacity FROM control_settings FOR UPDATE`;
    const [user] =
      await tx`SELECT e.id,u.email,e.account_state,e.invitation_expires_at FROM evaluator e JOIN auth_user u ON u.id=e.auth_user_id
      WHERE e.auth_user_id=${authId} AND e.enabled AND e.expires_at>now() FOR UPDATE OF e`;
    if (!user || user.email !== email)
      throw new ControlError("mail_unavailable", 503);
    const [tokenRow] =
      await tx`SELECT id FROM auth_verification WHERE identifier=${`reset-password:${token}`} AND value=${authId} AND "expiresAt">now()`;
    if (!tokenRow) throw new ControlError("operation_conflict", 409);
    if (user.account_state === "pending") {
      if (
        !user.invitation_expires_at ||
        new Date(user.invitation_expires_at).getTime() <= Date.now()
      ) {
        const [count] =
          await tx`SELECT count(*)::integer AS count FROM evaluator WHERE enabled AND expires_at>now() AND (account_state='active' OR invitation_expires_at>now())`;
        if (
          !settings ||
          (count?.count ?? settings.capacity) >= settings.capacity
        )
          throw new ControlError("capacity_reached", 409);
      }
      await tx`UPDATE evaluator SET invitation_expires_at=now()+interval '1 hour' WHERE id=${user.id}`;
    }
    await rateLimit(tx, `mail:user:${user.id}`, 3, 3600);
    await rateLimit(tx, "mail:day", 100, 86400);
    const [month] =
      await tx`INSERT INTO control_rate(key,window_start,count) VALUES('mail:month',date_trunc('month',now()),1)
      ON CONFLICT(key,window_start) DO UPDATE SET count=control_rate.count+1 RETURNING count`;
    if (!month || month.count > 3000)
      throw new ControlError("mail_limited", 429);
    // Only a still-valid Better Auth token is queued; concurrent stale callbacks fail closed.
    await tx`DELETE FROM auth_verification WHERE value=${authId} AND identifier LIKE 'reset-password:%' AND identifier<>${`reset-password:${token}`}`;
    const old =
      await tx`UPDATE account_mail SET state='expired',updated_at=now() WHERE user_id=${user.id}
      AND state IN ('pending','failed','sending','accepted') RETURNING secret_id`;
    for (const row of old)
      if (row.secret_id) {
        await tx`UPDATE account_mail SET secret_id=NULL WHERE secret_id=${row.secret_id}`;
        await secretStore.remove(row.secret_id, tx);
      }
    const id = randomUUID();
    const secretId = await secretStore.put(
      JSON.stringify({ to: email, url: url.toString() }),
      `mail:${id}`,
      tx,
    );
    await tx`INSERT INTO account_mail(id,user_id,secret_id,expires_at) VALUES(${id},${user.id},${secretId},now()+interval '1 hour')`;
  });
}
type MailPayload = { to: string; url: string };
export type MailSender = (
  payload: MailPayload,
  id: string,
  expiresAt: number,
) => Promise<string>;
export async function resendSender(
  payload: MailPayload,
  id: string,
  expiresAt: number,
) {
  if (
    !externallyEnabled("EMAIL") ||
    process.env.MOBAI_EMAIL_TRACKING_DISABLED !== "true"
  )
    throw new ControlError("feature_disabled", 503);
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MOBAI_EMAIL_FROM ?? "mobai@alansalazar.dev";
  if (
    !key ||
    !/^[A-Za-z0-9._+-]+@(?:[A-Za-z0-9-]+\.)*alansalazar\.dev$/.test(from)
  )
    throw new ControlError("mail_unavailable", 503);
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) throw new ControlError("operation_conflict", 409);
  const result = await new Resend(key).emails.send(
    {
      from,
      to: [payload.to],
      subject: "mobai · Activa o recupera tu cuenta",
      text: `Establece tu contraseña en mobai: ${payload.url}\n\nEl enlace es de un solo uso y caduca en una hora. Si no lo solicitaste, ignora este mensaje.`,
    },
    {
      idempotencyKey: `mobai-account/${id}`,
      signal: AbortSignal.timeout(Math.min(10_000, remaining)),
    },
  );
  if (result.error || !result.data?.id) {
    const value = result.headers?.["retry-after"];
    const seconds = value
      ? Number.isFinite(Number(value))
        ? Number(value)
        : Math.ceil((Date.parse(value) - Date.now()) / 1000)
      : 60;
    throw new ControlError(
      "mail_unavailable",
      503,
      Math.min(3600, Math.max(60, Number.isFinite(seconds) ? seconds : 60)),
    );
  }
  return result.data.id;
}
/** One activity-bounded batch. No timers, cron, or unbounded background polling. */
export async function drainAccountMail(
  sender: MailSender = resendSender,
  maximum = 5,
) {
  if (sender === resendSender && !externallyEnabled("EMAIL")) return 0;
  const sql = database();
  let sent = 0;
  for (let index = 0; index < Math.min(maximum, 10); index++) {
    const row = await sql
      .begin(async (tx) => {
        const expired =
          await tx`SELECT id,secret_id FROM account_mail WHERE state IN ('pending','failed','sending') AND expires_at<=now() FOR UPDATE`;
        for (const item of expired) {
          await tx`UPDATE account_mail SET state='expired',secret_id=NULL,updated_at=now() WHERE id=${item.id}`;
          if (item.secret_id) await secretStore.remove(item.secret_id, tx);
        }
        const [mail] =
          await tx`SELECT m.* FROM account_mail m JOIN evaluator e ON e.id=m.user_id
        WHERE e.enabled AND e.expires_at>now() AND m.expires_at>now() AND m.attempts<3 AND m.available_at<=now()
        AND (m.state IN ('pending','failed') OR (m.state='sending' AND m.lease_until<now()))
        ORDER BY m.created_at FOR UPDATE OF m SKIP LOCKED LIMIT 1`;
        if (!mail) return null;
        if (mail.attempts === 0) {
          await rateLimit(tx, "mail:send:day", 100, 86400);
          const [month] =
            await tx`INSERT INTO control_rate(key,window_start,count) VALUES('mail:send:month',date_trunc('month',now()),1)
          ON CONFLICT(key,window_start) DO UPDATE SET count=control_rate.count+1 RETURNING count`;
          if (!month || month.count > 3000)
            throw new ControlError("mail_limited", 429);
        }
        await tx`UPDATE account_mail SET state='sending',attempts=attempts+1,lease_until=now()+interval '60 seconds',updated_at=now() WHERE id=${mail.id}`;
        return mail;
      })
      .catch((error) => {
        if (
          error instanceof ControlError &&
          ["rate_limited", "mail_limited"].includes(error.code)
        )
          return null;
        throw error;
      });
    if (!row?.secret_id) break;
    try {
      const payload = JSON.parse(
        await secretStore.read(row.secret_id, `mail:${row.id}`),
      ) as MailPayload;
      const expiresAt = new Date(row.expires_at).getTime();
      if (expiresAt <= Date.now())
        throw new ControlError("operation_conflict", 409);
      const providerId = await sender(payload, row.id, expiresAt);
      await sql.begin(async (tx) => {
        // Webhooks may race the send response; retain and project already-received events.
        const [event] =
          await tx`SELECT type FROM account_mail_event WHERE provider_id=${providerId} AND type IN ('email.delivered','email.bounced','email.complained','email.failed') ORDER BY (type<>'email.delivered') DESC,occurred_at DESC LIMIT 1`;
        const state = event
          ? event.type === "email.delivered"
            ? "delivered"
            : "bounced"
          : "accepted";
        await tx`UPDATE account_mail SET state=${state},provider_id=${providerId},secret_id=NULL,lease_until=NULL,updated_at=now() WHERE id=${row.id} AND state='sending'`;
        const [referenced] =
          await tx`SELECT id FROM account_mail WHERE secret_id=${row.secret_id}`;
        if (!referenced) await secretStore.remove(row.secret_id, tx);
      });
      sent++;
    } catch (error) {
      const delay = Math.max(
        60 * 2 ** row.attempts,
        error instanceof ControlError ? (error.retryAfter ?? 0) : 0,
      );
      await sql`UPDATE account_mail SET state='failed',lease_until=NULL,available_at=now()+${delay}*interval '1 second',updated_at=now() WHERE id=${row.id} AND state='sending'`;
    }
  }
  return sent;
}
export async function acceptMailEvent(raw: string, headers: Headers) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) throw new ControlError("feature_disabled", 503);
  let event: ReturnType<Resend["webhooks"]["verify"]>;
  try {
    event = new Resend("verification-only").webhooks.verify({
      payload: raw,
      headers: {
        id: headers.get("svix-id") ?? "",
        timestamp: headers.get("svix-timestamp") ?? "",
        signature: headers.get("svix-signature") ?? "",
      },
      webhookSecret: secret,
    });
  } catch {
    throw new ControlError("access_denied", 403);
  }
  const data = event.data as { email_id?: string };
  if (!data.email_id) return;
  await database().begin(async (tx) => {
    const inserted =
      await tx`INSERT INTO account_mail_event(id,provider_id,type,occurred_at)
      VALUES(${headers.get("svix-id") ?? ""},${data.email_id ?? ""},${event.type},${event.created_at}) ON CONFLICT DO NOTHING RETURNING id`;
    if (!inserted.length) return;
    const state =
      event.type === "email.delivered"
        ? "delivered"
        : ["email.bounced", "email.complained", "email.failed"].includes(
              event.type,
            )
          ? "bounced"
          : null;
    if (state)
      await tx`UPDATE account_mail SET state=${state},updated_at=now() WHERE provider_id=${data.email_id ?? ""}
      AND (state IN ('accepted','sending') OR (${state}='bounced' AND state='delivered'))`;
  });
}
