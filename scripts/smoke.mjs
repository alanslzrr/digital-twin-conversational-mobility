import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const web = parseEnv(readFileSync("apps/eve-web/.env.local", "utf8"));
const base = "http://127.0.0.1:3001";
for (const [url, expected] of [
  ["http://127.0.0.1:3000/api/health", "eve-web"],
  [`${base}/api/health`, "mobility-core"],
]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).service, expected);
}
assert.equal(
  (
    await fetch(`${base}/mcp`, {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
    })
  ).status,
  401,
);
const headers = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  Authorization: `Bearer ${web.MOBILITY_MCP_TOKEN}`,
};
async function rpc(id, method, params) {
  const response = await fetch(`${base}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(60_000),
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  const result = response.headers
    .get("content-type")
    ?.includes("text/event-stream")
    ? JSON.parse(
        text
          .split("\n")
          .find((line) => line.startsWith("data: "))
          .slice(6),
      )
    : JSON.parse(text);
  assert.equal(result.error, undefined);
  return result.result;
}
await rpc(1, "initialize", {
  protocolVersion: "2025-11-25",
  capabilities: {},
  clientInfo: { name: "foundation-smoke", version: "1.0.0" },
});
headers["MCP-Protocol-Version"] = "2025-11-25";
const list = await rpc(2, "tools/list", {});
assert.deepEqual(
  list.tools.map((tool) => tool.name),
  [
    "get_source_health",
    "resolve_place",
    "plan_journey",
    "get_emt_arrivals",
    "get_crtm_timetable",
    "get_departures",
    "get_incidents",
    "get_bike_availability",
    "get_environment",
    "get_road_state",
    "get_historical_state",
    "get_parking",
  ],
);
const result = await rpc(3, "tools/call", {
  name: "get_source_health",
  arguments: { source: "renfe" },
});
const health = JSON.parse(result.content[0].text);
assert.equal(typeof health.liveDataReady, "boolean");
assert.equal(health.sources[0].id, "renfe");
assert.ok(Array.isArray(health.sources[0].streams));
if (process.argv.includes("--production")) {
  const eveHealth = await fetch("http://127.0.0.1:3000/eve/v1/health", {
    signal: AbortSignal.timeout(60_000),
  });
  assert.equal(eveHealth.status, 200);
  const session = await fetch("http://127.0.0.1:3000/eve/v1/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(60_000),
  });
  assert.equal(
    session.status,
    401,
    "Unauthenticated EVE sessions must fail before a model call",
  );
  console.log("EVE runtime health and production-mode authentication verified");
}
console.log(
  "Both HTTP services, MCP authentication, handshake, tools/list and tools/call verified. No model calls made.",
);
