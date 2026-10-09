import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import postgres from "postgres";
import { authOptions } from "../apps/mobility-core/src/better-auth.ts";

if (process.argv.some((arg) => arg.startsWith("--live")))
  throw new Error(
    "Legacy implicit-funding smoke is retired. Run an explicitly funded account through EVE; MOBILITY_BUDGET_MODE=campaign remains opt-in. See docs/accounts-and-llm.md.",
  );
const root = parseEnv(readFileSync(".env.local", "utf8"));
const web = parseEnv(readFileSync("apps/eve-web/.env.local", "utf8"));
if (!["127.0.0.1", "localhost"].includes(new URL(root.DATABASE_URL).hostname))
  throw new Error("Smoke requires the local database");
const require = createRequire(
  new URL("../apps/mobility-core/package.json", import.meta.url),
);
const { betterAuth } = await import(
  pathToFileURL(require.resolve("better-auth")).href
);
const { Pool } = require("pg");
const sql = postgres(root.DATABASE_URL, { max: 1 });
const pool = new Pool({ connectionString: root.DATABASE_URL, max: 1 });
const base = new URL(web.EVALUATION_ORIGIN || "http://127.0.0.1:3000").origin;
const auth = betterAuth(authOptions(pool, root.BETTER_AUTH_SECRET, base, true));
const users = [];
let sessionId;
async function call(path, method = "GET", body, cookie) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
}
async function access(body) {
  return fetch("http://127.0.0.1:3001/internal/evaluation", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${web.MOBILITY_MCP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
}
try {
  for (const index of [1, 2]) {
    const email = `smoke-${randomBytes(8).toString("hex")}@mobility.test`;
    const password = randomBytes(24).toString("base64url");
    const user = await sql.begin(async (tx) => {
      const [settings] =
        await tx`SELECT capacity FROM control_settings FOR UPDATE`;
      const [count] =
        await tx`SELECT count(*)::integer AS count FROM evaluator WHERE enabled AND expires_at>now() AND (account_state='active' OR invitation_expires_at>now())`;
      assert.ok(
        settings && count.count < settings.capacity,
        "Two free account places are required for this local smoke",
      );
      const account = await auth.api.createUser({
        body: { email, password, name: `Smoke ${index}` },
      });
      const fixture = { authId: account.user.id, email, password };
      users.push(fixture);
      const [row] =
        await tx`INSERT INTO evaluator(label,auth_user_id) VALUES (${`Smoke ${index}`},${account.user.id}) RETURNING id`;
      fixture.id = row.id;
      return fixture;
    });
    const response = await call("/api/auth/sign-in/email", "POST", {
      email,
      password,
    });
    assert.equal(
      response.status,
      200,
      `Better Auth login failed (${response.status})`,
    );
    user.cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    assert.ok(user.cookie);
    const identity = await call(
      "/api/evaluation",
      "GET",
      undefined,
      user.cookie,
    );
    assert.equal(identity.status, 200);
    assert.equal((await identity.json()).principalId, user.id);
  }
  console.log("Better Auth login and explicit evaluator identities verified.");
  assert.equal(
    (
      await call("/api/auth/sign-up/email", "POST", {
        email: "intruder@mobility.test",
        password: "not-allowed-to-sign-up",
        name: "Unknown",
      })
    ).status,
    404,
  );
  assert.equal((await call("/eve/v1/session", "POST", {})).status, 401);
  const csrf = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(csrf.status, 403);
  const created = await call("/eve/v1/session", "POST", {}, users[0].cookie);
  assert.equal(
    created.status,
    202,
    `Parked session failed (${created.status})`,
  );
  sessionId = (await created.json()).sessionId;
  assert.ok(sessionId);
  for (const suffix of [
    "",
    "/cancel",
    "/compact",
    "/clear",
    "/reset",
    "/stream",
  ]) {
    const result = await call(
      `/eve/v1/session/${sessionId}${suffix}`,
      suffix === "/stream" ? "GET" : "POST",
      suffix === "/stream" ? undefined : {},
      users[1].cookie,
    );
    assert.equal(result.status, 403, `Cross-user ${suffix} must be denied`);
  }
  console.log(
    "Anonymous access, closed registration, CSRF and cross-user session controls verified.",
  );
  // R2.1: metadata-only history on the existing isolated evaluator fixtures.
  const historyBefore =
    await sql`SELECT * FROM evaluation_usage WHERE evaluator_id=${users[0].id} ORDER BY window_kind`;
  const windowBefore = await sql`SELECT active_until FROM ingestion_activity`;
  const sessionBefore =
    await sql`SELECT * FROM evaluation_session WHERE session_id=${sessionId}`;
  await sql`INSERT INTO evaluation_session(session_id,evaluator_id,created_at)
    SELECT ${`history-${users[0].id}-`}||n::text,${users[0].id},now()-interval '1 minute' FROM generate_series(1,25) n`;
  const path = "/api/evaluation/conversations";
  const first = await call(path, "GET", undefined, users[0].cookie);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "no-store");
  const firstPage = await first.json();
  assert.equal(firstPage.sessions.length, 20);
  assert.ok(firstPage.nextCursor);
  const secondPage = await (
    await call(
      `${path}?cursor=${encodeURIComponent(JSON.stringify(firstPage.nextCursor))}`,
      "GET",
      undefined,
      users[0].cookie,
    )
  ).json();
  assert.equal(secondPage.sessions.length, 6);
  assert.equal(secondPage.nextCursor, null);
  assert.equal(
    new Set(
      [...firstPage.sessions, ...secondPage.sessions].map(
        (item) => item.sessionId,
      ),
    ).size,
    26,
  );
  assert.deepEqual(Object.keys(firstPage.sessions[0]).sort(), [
    "createdAt",
    "expiresAt",
    "sessionId",
  ]);
  assert.deepEqual(
    await (await call(path, "GET", undefined, users[1].cookie)).json(),
    { sessions: [], nextCursor: null },
  );
  assert.equal((await call(path)).status, 401);
  assert.equal(
    (
      await call(
        `${path}?principalId=${users[0].id}`,
        "GET",
        undefined,
        users[1].cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (await call(`${path}?cursor=invalid`, "GET", undefined, users[0].cookie))
      .status,
    400,
  );
  assert.deepEqual(
    await sql`SELECT * FROM evaluation_usage WHERE evaluator_id=${users[0].id} ORDER BY window_kind`,
    historyBefore,
  );
  assert.deepEqual(
    await sql`SELECT active_until FROM ingestion_activity`,
    windowBefore,
  );
  assert.deepEqual(
    await sql`SELECT * FROM evaluation_session WHERE session_id=${sessionId}`,
    sessionBefore,
  );
  await sql`DELETE FROM evaluation_session WHERE evaluator_id=${users[0].id} AND session_id<>${sessionId}`;
  console.log(
    "Conversation history: authentication, ownership, 20+6 pagination and read-only effects verified.",
  );
  const [limits] = await sql`SELECT requests_per_minute FROM control_settings`;
  const quota = await Promise.all(
    Array.from({ length: limits.requests_per_minute + 2 }, () =>
      access({ action: "authorize", principalId: users[1].id, consume: true }),
    ),
  );
  assert.ok(quota.some((response) => response.status === 429));
  const counters =
    await sql`SELECT requests FROM evaluation_usage WHERE evaluator_id=${users[1].id} AND window_kind='minute'`;
  const [settings] =
    await sql`SELECT requests_per_minute FROM control_settings`;
  assert.ok(
    counters.every((row) => row.requests <= settings.requests_per_minute),
    "Concurrent requests exceeded quota",
  );
  const reset = await call(
    `/eve/v1/session/${sessionId}/reset`,
    "POST",
    {},
    users[0].cookie,
  );
  assert.equal(reset.status, 200);
  assert.equal(
    (
      await call(
        `/eve/v1/session/${sessionId}/stream`,
        "GET",
        undefined,
        users[0].cookie,
      )
    ).status,
    403,
  );
  await sql`UPDATE evaluator SET enabled=false WHERE id=${users[1].id}`;
  assert.equal(
    (await call("/api/evaluation", "GET", undefined, users[1].cookie)).status,
    401,
  );
  assert.equal(
    (await call("/api/auth/sign-out", "POST", {}, users[0].cookie)).status,
    200,
  );
  assert.equal(
    (await call("/api/evaluation", "GET", undefined, users[0].cookie)).status,
    401,
  );
  console.log(
    "Atomic quotas, session reset, evaluator revocation and logout verified.",
  );
} finally {
  for (const user of users) {
    if (user.id) {
      await sql`DELETE FROM evaluation_usage WHERE evaluator_id=${user.id}`;
      await sql`DELETE FROM evaluation_session WHERE evaluator_id=${user.id}`;
      await sql`DELETE FROM evaluator WHERE id=${user.id}`;
    }
    await sql`DELETE FROM auth_user WHERE id=${user.authId}`;
  }
  await sql.end();
  await pool.end();
}
