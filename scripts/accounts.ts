import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { getAuth } from "../apps/mobility-core/src/better-auth";
import { drainAccountMail } from "../apps/mobility-core/src/control/mail";
import { database } from "../apps/mobility-core/src/database";

const [action, target, ...nameParts] = process.argv.slice(2);
if (
  ![
    "bootstrap",
    "recover-bootstrap",
    "mail-once",
    "init-secret-store",
    "list",
  ].includes(action ?? "")
) {
  console.log(
    "Usage: pnpm accounts bootstrap <email> [name] | recover-bootstrap <email> | mail-once | init-secret-store <absolute path outside repository> | list",
  );
  process.exitCode = 1;
} else if (action === "init-secret-store") {
  if (
    !target ||
    !isAbsolute(target) ||
    resolve(target).startsWith(`${process.cwd()}${sep}`)
  )
    throw new Error("Use an absolute path outside this repository");
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, randomBytes(32).toString("base64"), {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    `Created private master-key file at ${target}. Configure MOBAI_SECRET_KEY_FILE in Core and keep an independent secure backup. No external service enabled.`,
  );
} else {
  const url = process.env.DATABASE_URL;
  if (
    !url ||
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)
  )
    throw new Error("This bootstrap operation is local-only");
  const sql = database();
  try {
    if (action === "mail-once")
      console.log(
        `Accepted by mail sender: ${await drainAccountMail()}. This is not delivery confirmation.`,
      );
    else if (action === "list")
      console.table(
        await sql`SELECT e.id,e.label,u.email,u.role,e.account_state,e.enabled,e.expires_at,e.invitation_expires_at FROM evaluator e JOIN auth_user u ON u.id=e.auth_user_id ORDER BY e.created_at`,
      );
    else {
      if (
        !target ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target) ||
        target.length > 254
      )
        throw new Error("A valid email is required");
      const email = target.toLowerCase();
      let created: string | undefined;
      try {
        await sql.begin(async (tx) => {
          const [settings] =
            await tx`SELECT capacity FROM control_settings FOR UPDATE`;
          if (!settings) throw new Error("Apply migrations first");
          const [existing] =
            await tx`SELECT e.*,u.role FROM evaluator e JOIN auth_user u ON u.id=e.auth_user_id WHERE u.email=${email}`;
          if (action === "recover-bootstrap") {
            if (existing?.role !== "admin")
              throw new Error(
                "Only an explicitly bootstrapped administrator can be recovered here",
              );
            await tx`INSERT INTO control_audit(action,target_id) VALUES('bootstrap.recovery',${existing.id})`;
            return;
          }
          if (
            (await tx`SELECT id FROM auth_user WHERE role='admin' LIMIT 1`)
              .length
          )
            throw new Error(
              "An administrator already exists; use the authenticated administration panel",
            );
          const [count] =
            await tx`SELECT count(*)::integer AS count FROM evaluator WHERE enabled AND expires_at>now() AND (account_state='active' OR invitation_expires_at>now())`;
          const counted =
            existing?.enabled &&
            new Date(existing.expires_at).getTime() > Date.now() &&
            (existing.account_state === "active" ||
              (existing.invitation_expires_at &&
                new Date(existing.invitation_expires_at).getTime() >
                  Date.now()));
          if (
            !counted &&
            (count?.count ?? settings.capacity) >= settings.capacity
          )
            throw new Error("Account capacity reached");
          let id = existing?.id,
            authId = existing?.auth_user_id;
          if (!existing) {
            const name = nameParts.join(" ").trim();
            if (!name || name.length > 100)
              throw new Error(
                "A name (1–100 characters) is required for a new administrator",
              );
            const user = await getAuth().api.createUser({
              body: { email, name },
            });
            created = user.user.id;
            authId = created;
            const [row] =
              await tx`INSERT INTO evaluator(label,auth_user_id,account_state,invitation_expires_at) VALUES(${name},${authId},'pending',now()+interval '1 hour') RETURNING id`;
            id = row?.id;
          }
          await tx`UPDATE auth_user SET role='admin',"updatedAt"=now() WHERE id=${authId}`;
          await tx`UPDATE evaluator SET enabled=true,expires_at=now()+interval '30 days' WHERE id=${id}`;
          await tx`DELETE FROM auth_session WHERE "userId"=${authId}`;
          await tx`INSERT INTO control_audit(action,target_id) VALUES('bootstrap.admin',${id})`;
        });
      } catch (error) {
        if (created)
          await sql`DELETE FROM auth_user WHERE id=${created} AND NOT EXISTS(SELECT 1 FROM evaluator WHERE auth_user_id=${created})`;
        throw error;
      }
      await getAuth().api.requestPasswordReset({ body: { email } });
      console.log(
        "Activation/recovery queued. No password or link is exposed. Email remains governed by Core opt-in settings; run mail-once only after approval. TOTP enrollment is required.",
      );
    }
  } finally {
    await sql.end();
  }
}
