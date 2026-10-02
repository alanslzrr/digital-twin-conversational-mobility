import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { readdir as list, readFile as read } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { SignJWT } from "jose";
import postgres from "postgres";
import { authOptions } from "../apps/mobility-core/src/better-auth.ts";
import { seedDashboardFixtures } from "./dashboard-qa-fixtures.mjs";

const require = createRequire(
  new URL("../apps/mobility-core/package.json", import.meta.url),
);
const { Pool } = require("pg");
const { betterAuth } = await import(
  pathToFileURL(require.resolve("better-auth")).href
);
const base = process.env.DATABASE_URL;
if (
  !base ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)
)
  throw Error("Local database required");
const schema = `dashboard_qa_${randomUUID().replaceAll("-", "")}`;
const admin = postgres(base, { max: 1, onnotice: () => {} });
mkdirSync("tmp/dashboard-qa", { recursive: true });
const u = new URL(base);
u.searchParams.set("options", `-c search_path=${schema},public`);
const db = u.href,
  sql = postgres(db, { max: 2, onnotice: () => {} });
const children = [];
const pool = new Pool({ connectionString: db, max: 2 });
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  for (const c of children) c.kill("SIGTERM");
  await sql.end();
  await pool.end();
  await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
  process.exit(process.exitCode ?? 0);
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
process.on("uncaughtException", async (error) => {
  if (error instanceof Error && error.message.startsWith("Smoke failed:"))
    console.error(error.message);
  console.error("Isolated QA failed; disposing owned test schema");
  process.exitCode = 1;
  await close();
});

await admin.unsafe(`CREATE SCHEMA ${schema}`);
writeFileSync("tmp/dashboard-qa/schema.txt", schema, { mode: 0o600 });
for (const n of (await list("infra/postgres/migrations"))
  .filter((n) => n.endsWith(".sql"))
  .sort())
  await sql.unsafe(await read(`infra/postgres/migrations/${n}`, "utf8"));
// Copy only retained public mobility snapshots into the isolated schema, no accounts or secrets.
await sql.unsafe(
  "INSERT INTO mobility_snapshot SELECT * FROM public.mobility_snapshot",
);
await sql.unsafe(
  "INSERT INTO source_health SELECT * FROM public.source_health ON CONFLICT(source_id) DO UPDATE SET status=excluded.status,last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,last_observed_at=excluded.last_observed_at,error_code=excluded.error_code",
);
const secret = randomBytes(32).toString("hex"),
  origin = "http://127.0.0.1:3002";
const auth = betterAuth(authOptions(pool, secret, origin, true));
for (let i = 1; i <= 2; i++) {
  const email = `dashboard-qa-${i}@example.invalid`,
    password = `Synthetic-dashboard-password-${i}`;
  const result = await auth.api.signUpEmail({
    body: { email, password, name: `QA evaluator ${i}` },
  });
  await sql`INSERT INTO evaluator(id,slot,label,auth_user_id) VALUES(${randomUUID()},${i},${`QA evaluator ${i}`},${result.user.id})`;
}
const token = await new SignJWT({
  scope:
    "mobility.read mobility.diagnostics.read mobility.evaluation.manage mobility.dashboard.read mobility.dashboard.execute mobility.dashboard.activity mobility.telemetry.write",
})
  .setProtectedHeader({ alg: "HS256" })
  .setSubject("dashboard-qa")
  .setIssuedAt()
  .setIssuer("dashboard-qa")
  .setAudience("mobility-core")
  .setExpirationTime("2h")
  .sign(new TextEncoder().encode(secret));
writeFileSync("tmp/dashboard-qa/network-guard.txt", "", { mode: 0o600 });
const common = {
  ...process.env,
  DATABASE_URL: db,
  DATABASE_URL_UNPOOLED: db,
  BETTER_AUTH_SECRET: secret,
  EVALUATION_ORIGIN: origin,
  MOBILITY_JWT_SECRET: secret,
  MOBILITY_JWT_ISSUER: "dashboard-qa",
  MOBILITY_JWT_AUDIENCE: "mobility-core",
  MOBILITY_ALLOWED_ORIGIN: origin,
  MOBILITY_INGESTION_ENABLED: "false",
  INGESTION_ENABLED: "false",
  MOBILITY_MCP_URL: "http://127.0.0.1:3003/mcp",
  MOBILITY_MCP_TOKEN: token,
  OPENAI_API_KEY: "",
  DASHBOARD_QA_NETWORK_GUARD_REPORT: new URL(
    "../tmp/dashboard-qa/network-guard.txt",
    import.meta.url,
  ).pathname,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${new URL("./dashboard-qa-network-guard.mjs", import.meta.url).pathname}`,
};
for (const [app, port] of [
  ["mobility-core", "3003"],
  ["eve-web", "3002"],
]) {
  const child = spawn(
    "node",
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      port,
    ],
    { cwd: `apps/${app}`, env: common, stdio: ["ignore", "pipe", "pipe"] },
  );
  children.push(child);
  child.stdout.on("data", (d) => process.stdout.write(`${app}: ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`${app}: ${d}`));
}

console.log(
  `Isolated QA origin ${origin}; provider/model acquisition disabled`,
);

for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(`${origin}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}
await seedDashboardFixtures(sql);
const report = [];
const check = (name, ok) => {
  report.push({ name, ok });
  if (!ok) {
    writeFileSync(
      "tmp/dashboard-qa/http-results.json",
      JSON.stringify(report, null, 2),
      { mode: 0o600 },
    );
    throw Error(`Smoke failed: ${name}`);
  }
};
const owners = await sql`SELECT id,slot FROM evaluator ORDER BY slot`;
await sql`INSERT INTO evaluation_session(session_id,evaluator_id) VALUES('qa-owned',${owners[0].id}),('qa-foreign',${owners[1].id})`;
const now = new Date().toISOString(),
  payloadId = randomUUID();
const payload = {
  schemaVersion: 1,
  id: payloadId,
  kind: "model_input",
  capturedAt: now,
  originalBytes: 120,
  retainedBytes: 100,
  redacted: false,
  truncated: false,
  captureStatus: "captured",
  reason: null,
  content: {
    messages: [
      {
        role: "user",
        parts: [{ type: "text", text: "Synthetic isolated QA content" }],
      },
    ],
    functions: [],
  },
};
const event = {
  eventKey: randomUUID(),
  kind: "attempt_completed",
  occurredAt: now,
  turnId: "qa-turn",
  stepIndex: 0,
  sequence: 1,
  purpose: "step",
  attemptId: randomUUID(),
  callId: null,
  tool: null,
  providerResponseId: "synthetic-response",
  status: "succeeded",
  durationMs: 20,
  isError: false,
  errorCode: null,
  usage: {
    inputTokens: 10,
    outputTokens: 4,
    cachedInputTokens: 2,
    reasoningTokens: null,
  },
  payloadIds: [payloadId],
  captureStatus: "captured",
  sentCallIds: [],
};
const capture = () =>
  fetch("http://127.0.0.1:3003/internal/telemetry", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      schemaVersion: 1,
      batchId: randomUUID(),
      principalId: owners[0].id,
      sessionId: "qa-owned",
      events: [event],
      payloads: [payload],
    }),
  });
let captured = await capture();
if (!captured.ok) {
  await captured.body?.cancel();
  captured = await capture();
}
console.log(`Sink smoke status ${captured.status}`);
check("terminal capture via authenticated internal sink", captured.ok);
// Dense, explicitly synthetic lifecycle/usage/tool fixtures; never call a model.
const denseEvents = Array.from({ length: 8 }, (_, i) => [
  {
    ...event,
    eventKey: randomUUID(),
    kind: "turn_completed",
    turnId: `qa-turn-${i}`,
    attemptId: null,
    durationMs: 1200 + i * 300,
    usage: null,
    payloadIds: [],
    sentCallIds: [],
  },
  {
    ...event,
    eventKey: randomUUID(),
    turnId: `qa-turn-${i}`,
    attemptId: randomUUID(),
    purpose: i === 3 ? "compaction" : "step",
    usage:
      i === 4
        ? null
        : {
            inputTokens: 10 + i * 7,
            outputTokens: i * 3,
            cachedInputTokens: i,
            reasoningTokens: null,
          },
    payloadIds: [],
    sentCallIds: i === 0 ? ["qa-call"] : [],
  },
]).flat();
denseEvents.push(
  {
    ...event,
    eventKey: randomUUID(),
    kind: "tool_requested",
    turnId: "qa-turn-0",
    captureStatus: "missing",
    attemptId: null,
    callId: "qa-call",
    tool: "mobility__get_network_status",
    usage: null,
    payloadIds: [],
  },
  {
    ...event,
    eventKey: randomUUID(),
    kind: "tool_result",
    turnId: "qa-turn-0",
    captureStatus: "missing",
    attemptId: null,
    callId: "qa-call",
    tool: "mobility__get_network_status",
    usage: null,
    payloadIds: [],
  },
  {
    ...event,
    eventKey: randomUUID(),
    kind: "tool_requested",
    turnId: "qa-turn-0",
    captureStatus: "missing",
    attemptId: null,
    callId: "qa-discovery",
    tool: "connection_search",
    usage: null,
    payloadIds: [],
  },
);
const denseCapture = await fetch("http://127.0.0.1:3003/internal/telemetry", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    schemaVersion: 1,
    batchId: randomUUID(),
    principalId: owners[0].id,
    sessionId: "qa-owned",
    events: denseEvents,
    payloads: [],
  }),
});
check("synthetic qualified tool and lifecycle capture", denseCapture.ok);
await denseCapture.body?.cancel();
async function login(i) {
  const r = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `dashboard-qa-${i}@example.invalid`,
      password: `Synthetic-dashboard-password-${i}`,
    }),
  });
  check(`Better Auth login ${i}`, r.ok);
  return r.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
}
const cookies = [await login(1), await login(2)];
async function getData(path, i = 0) {
  return fetch(`${origin}/api/dashboard/${path}`, {
    headers: { Cookie: cookies[i] },
    redirect: "manual",
  });
}
for (const path of [
  "status",
  "overview",
  "tools",
  "entities?category=bikes",
  "sources",
  "sources?window=24h",
  "sources/aemet?window=1h",
  "entities?category=places&section=reference&product=reference:tariffs",
  "entities/bikes/qa-recent/history?window=6h&product=bicimad",
  "events?window=24h",
  "conversations/qa-owned/events?family=tools",
  "conversations",
  "conversations/qa-owned/summary",
  "conversations/qa-owned/events",
  `conversations/qa-owned/payloads/${payloadId}`,
]) {
  const r = await getData(path);
  check(`BFF ${path}`, r.ok);
  await r.body?.cancel();
}
const overview = await (await getData("overview?window=24h")).json();
check(
  "derived M1 excludes stale and disabled station readings",
  overview.metrics?.find((m) => m.id === "M1")?.value === 4,
);
check(
  "derived M2 does not add heterogeneous parking categories",
  overview.metrics?.find((m) => m.id === "M2")?.value === 3,
);
check(
  "G2 derives bounded intervals in Core",
  overview.activity?.bins?.length === 24,
);
for (const path of [
  "conversations/qa-owned/summary",
  "conversations/qa-owned/events",
  `conversations/qa-owned/payloads/${payloadId}`,
])
  check(`foreign denied ${path}`, (await getData(path, 1)).status === 404);
const requestId = randomUUID();
const body = JSON.stringify({
  requestId,
  tool: "get_network_status",
  input: {},
  confirmEffects: true,
});
const manual = () =>
  fetch(`${origin}/api/dashboard/executions`, {
    method: "POST",
    headers: {
      Cookie: cookies[0],
      Origin: origin,
      "Content-Type": "application/json",
    },
    body,
  });
const first = await manual(),
  result = await first.json();
console.log(`Stored-only execution status ${first.status}`);
check("stored-only executor", first.ok && result.data?.state === "succeeded");
const second = await manual(),
  repeat = await second.json();
check(
  "duplicate request returns original id",
  second.ok && result.data?.id === repeat.data?.id,
);
check(
  "foreign execution denied",
  (await getData(`executions/${result.data.id}`, 1)).status === 404,
);
check(
  "anonymous BFF denied",
  (await fetch(`${origin}/api/dashboard/status`)).status === 401,
);
check(
  "cross-origin writer denied",
  (
    await fetch(`${origin}/api/dashboard/activity`, {
      method: "POST",
      headers: {
        Cookie: cookies[0],
        Origin: "https://example.invalid",
        "Content-Type": "application/json",
      },
      body: "{}",
    })
  ).status === 403,
);
check(
  "no provider/model requests during stored dashboard reads",
  (await read("tmp/dashboard-qa/network-guard.txt", "utf8")).length === 0,
);
writeFileSync(
  "tmp/dashboard-qa/http-results.json",
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
console.log(
  `Authenticated isolated HTTP smoke passed: ${report.length} checks`,
);
writeFileSync("tmp/dashboard-qa/schema.txt", schema, { mode: 0o600 });

if (!process.argv.includes("--preview")) await close();
