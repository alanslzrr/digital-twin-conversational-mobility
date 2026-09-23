import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import postgres from "postgres";
import { authOptions } from "../apps/mobility-core/src/better-auth.ts";

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
const base = "http://127.0.0.1:3000";
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
  for (const slot of [4, 5]) {
    const [existing] = await sql`SELECT id FROM evaluator WHERE slot=${slot}`;
    if (existing)
      throw new Error(`Smoke slot ${slot} is occupied; refusing to change it`);
    const email = `smoke-${randomBytes(8).toString("hex")}@mobility.test`;
    const password = randomBytes(24).toString("base64url");
    const account = await auth.api.signUpEmail({
      body: { email, password, name: `Smoke ${slot}` },
    });
    const user = { authId: account.user.id, email, password };
    users.push(user);
    const [row] =
      await sql`INSERT INTO evaluator(slot,label,auth_user_id) VALUES (${slot},${`Smoke ${slot}`},${account.user.id}) RETURNING id`;
    user.id = row.id;
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
  const quota = await Promise.all(
    Array.from({ length: 18 }, () =>
      access({ action: "authorize", principalId: users[1].id, consume: true }),
    ),
  );
  assert.ok(quota.some((response) => response.status === 429));
  const counters =
    await sql`SELECT requests FROM evaluation_usage WHERE evaluator_id=${users[1].id} AND window_kind='minute'`;
  assert.ok(
    counters.every((row) => row.requests <= 6),
    "Concurrent requests exceeded quota",
  );
  if (
    process.argv.includes("--live") ||
    process.argv.includes("--live-mobility") ||
    process.argv.includes("--live-weather")
  ) {
    const mobility = process.argv.includes("--live-mobility");
    const weather = process.argv.includes("--live-weather");
    const response = await call(
      `/eve/v1/session/${sessionId}`,
      "POST",
      {
        message: mobility
          ? "Prueba de movilidad: quiero ir ahora de la estación Madrid-Atocha Cercanías a la estación Madrid-Chamartín-Clara Campoamor, en Cercanías. Resuelve primero ambas estaciones con MCP en paralelo; elijo explícitamente esas estaciones Renfe, no estaciones de bicis. Después consulta en paralelo la ruta, la observación meteorológica de Madrid-Retiro y el estado de disponibilidad de la fuente EMT. Responde brevemente con el trayecto, base prevista o real, observación meteorológica con hora y fuente, y si EMT está disponible. No repitas consultas ni inventes datos."
          : weather
            ? "Consulta con Mobility MCP la última observación meteorológica de Madrid-Retiro (kind=weather, estación3195). Responde brevemente con temperatura, lluvia, fuente y hora de observación. Distingue claramente observación de previsión y lluvia acumulada de lluvia en este instante."
            : "Consulta el estado de la fuente Renfe usando Mobility MCP. Responde en una frase si hay datos disponibles.",
      },
      users[0].cookie,
    );
    assert.equal(response.status, 202);
    const stream = await fetch(
      `${base}/eve/v1/session/${sessionId}/stream?startIndex=0`,
      {
        headers: { Cookie: users[0].cookie },
        signal: AbortSignal.timeout(120_000),
      },
    );
    assert.equal(stream.status, 200);
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    const events = [];
    let completed = false;
    try {
      while (!completed) {
        const chunk = await reader.read();
        if (chunk.done) break;
        pending += decoder.decode(chunk.value, { stream: true });
        while (pending.includes("\n")) {
          const index = pending.indexOf("\n");
          const line = pending.slice(0, index);
          pending = pending.slice(index + 1);
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          events.push(event);
          if (
            event.type === "turn.completed" ||
            event.type === "turn.failed" ||
            event.type === "session.failed"
          ) {
            completed = true;
            break;
          }
        }
      }
    } finally {
      await reader.cancel();
    }
    const types = [...new Set(events.map((event) => event.type))];
    console.log("Live EVE event types:", types.join(", "));
    const actions = events.filter((event) => event.type === "action.result");
    const finalText = events
      .filter((event) => event.type === "message.completed")
      .map((event) => event.data.message ?? "")
      .join("\n");
    // Persist a bounded report even on failure, not hidden reasoning or raw events.
    mkdirSync("data/validation", { recursive: true });
    writeFileSync(
      `data/validation/conversation-${Date.now()}.json`,
      JSON.stringify(
        {
          verifiedAt: new Date().toISOString(),
          scenario: mobility
            ? "mobility"
            : weather
              ? "weather"
              : "source-health",
          completed: events.some((event) => event.type === "turn.completed"),
          completedSteps: events.filter(
            (event) => event.type === "step.completed",
          ).length,
          actions: actions.map((event) => ({
            tool: event.data.result.toolName,
            status: event.data.status,
            isError:
              event.data.result.isError === true ||
              event.data.result.output?.isError === true,
          })),
          answer: finalText,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    assert.ok(
      events.some((event) => event.type === "turn.completed"),
      "EVE turn did not complete",
    );
    const required = mobility
      ? [
          "resolve_place",
          "plan_journey",
          "get_environment",
          "get_source_health",
        ]
      : weather
        ? ["get_environment"]
        : ["get_source_health"];
    for (const tool of required) {
      const matches = actions.filter((event) =>
        String(event.data.result.toolName).includes(tool),
      );
      assert.ok(
        matches.some(
          (event) =>
            event.data.status === "completed" &&
            !event.data.result.isError &&
            !event.data.result.output?.isError,
        ),
        `${tool} did not complete`,
      );
    }
    assert.ok(finalText.trim(), "No visible assistant answer");
    if (mobility) {
      const results = JSON.stringify(actions);
      assert.ok(
        results.includes('"scheduled"') && results.includes('"aemet"'),
        "Expected real scheduled route and weather observations",
      );
    }
    if (weather) {
      const measured = actions.find((event) =>
        String(event.data.result.toolName).includes("get_environment"),
      )?.data.result.output?.structuredContent;
      assert.equal(measured?.provenance?.source, "aemet");
      assert.equal(measured?.readings?.[0]?.stationId, "3195");
    }
    // Only visible assistant text and action names: never print hidden reasoning,
    // provider headers, authentication bodies or the full event stream.
    console.log(
      "Completed tools:",
      actions.map((event) => event.data.result.toolName).join(", "),
    );
    console.log("Visible answer:", finalText);
    console.log(
      "Live EVE → direct GPT-6 Luna → authenticated Mobility MCP verified.",
    );
  }
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
