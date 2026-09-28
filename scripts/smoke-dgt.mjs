import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import postgres from "postgres";

const env = parseEnv(readFileSync("apps/eve-web/.env.local", "utf8"));
const databaseUrl = process.env.DATABASE_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl).hostname)
)
  throw new Error("Explicit local database required");
const sql = postgres(databaseUrl, { max: 1 });
const headers = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  Authorization: `Bearer ${env.MOBILITY_MCP_TOKEN}`,
};
let id = 1;
async function rpc(method, params) {
  const response = await fetch("http://127.0.0.1:3001/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params }),
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  const parsed = response.headers
    .get("content-type")
    ?.includes("text/event-stream")
    ? JSON.parse(
        text
          .split("\n")
          .find((l) => l.startsWith("data: "))
          .slice(6),
      )
    : JSON.parse(text);
  assert.equal(parsed.error, undefined);
  return parsed.result;
}
async function tool(name, args) {
  const result = await rpc("tools/call", { name, arguments: args });
  assert.notEqual(result.isError, true);
  return result.structuredContent ?? JSON.parse(result.content[0].text);
}
try {
  await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "dgt-targeted-smoke", version: "1" },
  });
  headers["MCP-Protocol-Version"] = "2025-11-25";
  const dgt = await tool("get_incidents", {
    source: "dgt",
    query: "Madrid",
    limit: 3,
  });
  assert.equal(dgt.status, "available");
  assert.equal(dgt.provenance.source, "dgt");
  assert.ok(dgt.incidents.length > 0);
  assert.ok(
    dgt.incidents.every(
      (i) =>
        i.id && Number.isInteger(i.version) && i.location && i.temporalStatus,
    ),
  );
  const before = await sql`SELECT active_until FROM ingestion_activity`;
  const attempts = await sql`SELECT id,attempts FROM ingestion_job ORDER BY id`;
  const line = await tool("get_line_status", { source: "renfe", line: "C-5" });
  assert.equal(line.lineIdentity.status, "known");
  assert.equal(line.serviceStatus, "not_established");
  const unknown = await tool("get_line_status", {
    source: "renfe",
    line: "C999",
  });
  assert.equal(unknown.status, "unknown_line");
  const metro = await tool("get_line_status", {
    source: "crtm",
    network: "metro",
    line: "1",
  });
  assert.equal(metro.status, "known_line");
  assert.equal(metro.staticCatalog.currentServiceEnvelope, false);
  const network = await tool("get_network_status", { source: "dgt" });
  assert.equal(network.components[0].source, "dgt");
  assert.ok(network.components[0].streams[0].summary.totals.incidents > 0);
  const view = await tool("get_mobility_snapshot", {});
  assert.equal(view.status, "partial_coverage");
  assert.ok(view.components.some((c) => c.source === "bicimad"));
  assert.deepEqual(
    await sql`SELECT active_until FROM ingestion_activity`,
    before,
    "Aggregates must not extend the window",
  );
  assert.deepEqual(
    await sql`SELECT id,attempts FROM ingestion_job ORDER BY id`,
    attempts,
    "Run with --no-worker to verify aggregates cause no provider attempts",
  );
  const historical = await tool("get_historical_state", {
    source: "dgt",
    minutesAgo: 0,
    mode: "knowledge",
  });
  assert.equal(historical.status, "available");
  console.log(
    JSON.stringify({
      checks: 7,
      dgt: {
        total: dgt.total,
        returned: dgt.incidents.length,
        observedAt: dgt.provenance.observedAt,
        freshness: dgt.freshness,
      },
      aggregateComponents: view.components.length,
      providerAttemptsUnchanged: true,
      activityWindowUnchanged: true,
      history: historical.status,
    }),
  );
} finally {
  await sql.end();
}
