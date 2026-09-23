import { randomBytes } from "node:crypto";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { authOptions } from "../apps/mobility-core/src/better-auth.ts";

const require = createRequire(
  new URL("../apps/mobility-core/package.json", import.meta.url),
);
const { betterAuth } = await import(
  pathToFileURL(require.resolve("better-auth")).href
);
const { Pool } = require("pg");
const [action, slotText, emailArg, ...labelParts] = process.argv.slice(2);
const slot = Number(slotText);
if (
  !["create", "reset", "revoke", "list"].includes(action) ||
  (action !== "list" && (!Number.isInteger(slot) || slot < 1 || slot > 5))
) {
  throw new Error(
    "Usage: pnpm evaluator create <1..5> <email> <name> | reset <1..5> | revoke <1..5> | list",
  );
}
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname) &&
  process.env.ALLOW_REMOTE_ADMIN !== "true"
) {
  throw new Error(
    "Remote evaluator administration requires ALLOW_REMOTE_ADMIN=true",
  );
}
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret || secret.length < 32)
  throw new Error("BETTER_AUTH_SECRET is required");
const sql = postgres(url, { max: 1, connect_timeout: 10 });
const pool = new Pool({ connectionString: url, max: 1 });
const auth = betterAuth(
  authOptions(
    pool,
    secret,
    process.env.EVALUATION_ORIGIN || "http://127.0.0.1:3000",
    true,
  ),
);
try {
  if (action === "create" || action === "reset") {
    const password = randomBytes(24).toString("base64url");
    const label = labelParts.join(" ").trim();
    const email = emailArg?.trim().toLowerCase();
    if (
      action === "create" &&
      (!email ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !label ||
        label.length > 80)
    )
      throw new Error("Provide valid email and name (1–80 characters)");
    mkdirSync("data/evaluators", { recursive: true, mode: 0o700 });
    const path = `data/evaluators/${process.env.ALLOW_REMOTE_ADMIN === "true" ? "cloud" : "local"}-slot-${slot}-${Date.now()}.txt`;
    let createdId;
    try {
      await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(90123002)`;
        const [existing] =
          await tx`SELECT e.auth_user_id, u.email FROM evaluator e JOIN auth_user u ON u.id=e.auth_user_id WHERE e.slot=${slot}`;
        if (action === "create") {
          if (existing)
            throw new Error(
              "Slot already occupied; revoke or reset it instead",
            );
          const result = await auth.api.signUpEmail({
            body: { email, password, name: label },
          });
          createdId = result.user.id;
          await tx`INSERT INTO evaluator(slot, label, auth_user_id) VALUES (${slot}, ${label}, ${createdId})`;
        } else {
          if (!existing) throw new Error("Evaluator not found");
          const context = await auth.$context;
          const hash = await context.password.hash(password);
          await tx`UPDATE auth_account SET password=${hash}, "updatedAt"=now() WHERE "userId"=${existing.auth_user_id} AND "providerId"='credential'`;
          await tx`DELETE FROM auth_session WHERE "userId"=${existing.auth_user_id}`;
        }
        writeFileSync(
          path,
          `Email: ${email ?? existing.email}\nPassword: ${password}\n`,
          { flag: "wx", mode: 0o600 },
        );
      });
    } catch (error) {
      if (createdId) await sql`DELETE FROM auth_user WHERE id=${createdId}`;
      try {
        unlinkSync(path);
      } catch {
        /* No credentials file was written. */
      }
      throw error;
    }
    console.log(
      `Credentials saved in ignored ${path}. Share privately; passwords are never logged.`,
    );
  } else if (action === "revoke") {
    await sql.begin(async (tx) => {
      const [user] =
        await tx`UPDATE evaluator SET enabled=false WHERE slot=${slot} RETURNING auth_user_id`;
      if (user)
        await tx`DELETE FROM auth_session WHERE "userId"=${user.auth_user_id}`;
    });
    console.log(`Slot ${slot} revoked, including existing login sessions.`);
  } else {
    console.table(
      await sql`SELECT e.slot,e.label,u.email,e.enabled,e.expires_at FROM evaluator e JOIN auth_user u ON u.id=e.auth_user_id ORDER BY e.slot`,
    );
  }
} finally {
  await sql.end();
  await pool.end();
}
