import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Local, authenticated MCP acceptance only: no model, benchmark, worker control,
// account mutation or provider credentials. MCP calls renew the activity window.
const options = new Map(
  process.argv.slice(2).map((arg) => {
    assert.match(
      arg,
      /^--(?:port|at)=.+$/,
      "Use --port=<local port> or --at=<ISO instant>",
    );
    const separator = arg.indexOf("=");
    return [arg.slice(2, separator), arg.slice(separator + 1)];
  }),
);
const port = Number(options.get("port") ?? 3001);
assert.ok(
  Number.isInteger(port) && port >= 1024 && port <= 65535,
  "Invalid local port",
);
const at = options.get("at") ?? new Date().toISOString();
assert.ok(
  /(?:Z|[+-]\d{2}:\d{2})$/.test(at) && Number.isFinite(Date.parse(at)),
  "Expected ISO instant with offset",
);
const endpoint = `http://127.0.0.1:${port}/mcp`;
const { MOBILITY_MCP_TOKEN: token } = parseEnv(
  readFileSync("apps/eve-web/.env.local", "utf8"),
);
assert.ok(token, "Configure the existing local MCP token before running");
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};
const startedAt = new Date().toISOString();
const directory = `data/validation/routing-${startedAt.replace(/[:.]/g, "-")}`;
mkdirSync(directory, { recursive: true });
const sourceFiles = [
  "apps/mobility-core/src/routing.ts",
  "apps/mobility-core/app/mcp/route.ts",
  "packages/contracts/src/index.ts",
  "packages/domain/src/routing.ts",
  "scripts/smoke-routing.mjs",
];
const evidence = {
  mode: "local-mcp-no-model",
  startedAt,
  endpoint,
  at,
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  workingTreeDirty: !!execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim(),
  clientSourceHashes: Object.fromEntries(
    sourceFiles.map((path) => [
      path,
      createHash("sha256").update(readFileSync(path)).digest("hex"),
    ]),
  ),
  // These describe the local checkout, not proof of the server's loaded build.
  graphManifest: JSON.parse(
    readFileSync("data/otp/graph-manifest.json", "utf8"),
  ),
  modelCalls: 0,
  cases: [],
  status: "running",
};
let id = 0;
async function rpc(method, params) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    redirect: "error",
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(
    response.status,
    200,
    "MCP HTTP failure (check local runtime and token validity)",
  );
  const session = response.headers.get("mcp-session-id");
  if (session) headers["Mcp-Session-Id"] = session;
  const body = await response.text();
  const data = JSON.parse(
    body.startsWith("event:") || body.startsWith("data:")
      ? body
          .split("\n")
          .find((line) => line.startsWith("data: "))
          .slice(6)
      : body,
  );
  assert.equal(data.error, undefined, "MCP protocol error");
  return data.result;
}
async function tool(name, args) {
  const result = await rpc("tools/call", { name, arguments: args });
  assert.notEqual(result.isError, true, "MCP tool failed");
  return result.structuredContent ?? JSON.parse(result.content[0].text);
}
async function check(caseId, input, validate) {
  const started = performance.now();
  const entry = {
    caseId,
    input,
    requestedAt: new Date().toISOString(),
    status: "running",
  };
  evidence.cases.push(entry);
  try {
    entry.result = await tool("plan_journey", input);
    validate(entry.result);
    entry.status = "pass";
  } catch (error) {
    entry.status = "fail";
    // Do not persist exception messages/HTTP bodies that could contain secrets.
    entry.failure =
      error instanceof assert.AssertionError
        ? "assertion_failed"
        : "request_failed";
    throw error;
  } finally {
    entry.elapsedMs = Math.round(performance.now() - started);
  }
}
function validateRoute(result, input, requireAvailable) {
  assert.ok(
    ["available", "no_route"].includes(result.status),
    "Unexpected routing failure",
  );
  if (requireAvailable)
    assert.equal(
      result.status,
      "available",
      "Positive route case must have itineraries",
    );
  assert.ok(
    ["scheduled", "scheduled_with_partial_realtime"].includes(result.basis),
  );
  assert.equal(
    result.realtimeApplied,
    result.basis === "scheduled_with_partial_realtime",
  );
  assert.equal(result.accessibilityGuaranteed, false);
  assert.equal(result.staticVersion, evidence.graphManifest.staticVersion);
  assert.ok(result.itineraries.length <= 3);
  assert.equal(result.itineraries.length > 0, result.status === "available");
  for (const route of result.itineraries) {
    assert.ok(route.walkTime <= input.preferences.maxWalkingMinutes * 60);
    assert.ok(route.numberOfTransfers <= input.preferences.maxTransfers);
    assert.ok(route.legs.length > 0);
    if (!input.modes.includes("WALK"))
      assert.ok(route.legs.some((leg) => leg.trip));
    if (!input.modes.includes("TRANSIT"))
      assert.ok(route.legs.every((leg) => leg.mode === "WALK"));
    assert.ok(route.legs.every((leg) => leg.mode === "WALK" || leg.trip));
  }
}
try {
  await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "routing-acceptance", version: "1.0.0" },
  });
  headers["MCP-Protocol-Version"] = "2025-11-25";
  const origins = await tool("resolve_place", { query: "Atocha", limit: 10 });
  const destinations = await tool("resolve_place", {
    query: "Chamartín",
    limit: 10,
  });
  evidence.resolution = { origins, destinations };
  const origin = origins.places.find((place) => place.kind === "station");
  const destination = destinations.places.find(
    (place) => place.kind === "station",
  );
  assert.ok(origin && destination, "Required Renfe stations are missing");
  const base = {
    originId: origin.id,
    destinationId: destination.id,
    departureTime: at,
    modes: ["TRANSIT"],
    preferences: { maxWalkingMinutes: 15, maxTransfers: 2, wheelchair: false },
  };
  for (const modes of [["TRANSIT"], ["TRANSIT", "WALK"], ["WALK"]]) {
    const input = { ...base, modes };
    await check(`T03-${modes.join("+")}`, input, (result) =>
      validateRoute(result, input, modes.includes("TRANSIT")),
    );
  }
  const nearby = await tool("resolve_place", { query: "Sol", limit: 10 });
  evidence.resolution.nearby = nearby;
  const sol = nearby.places.find((place) => place.kind === "station");
  assert.ok(sol, "Required nearby station is missing");
  const walking = {
    ...base,
    destinationId: sol.id,
    modes: ["WALK"],
    preferences: { ...base.preferences, maxWalkingMinutes: 60 },
  };
  await check("T03-WALK-positive", walking, (result) =>
    validateRoute(result, walking, true),
  );
  const reverse = {
    ...base,
    originId: destination.id,
    destinationId: origin.id,
  };
  await check("T03-TRANSIT-reverse", reverse, (result) =>
    validateRoute(result, reverse, true),
  );
  for (const [name, preferences] of [
    ["zero-walking", { ...base.preferences, maxWalkingMinutes: 0 }],
    ["zero-transfers", { ...base.preferences, maxTransfers: 0 }],
    ["wheelchair", { ...base.preferences, wheelchair: true }],
  ]) {
    const input = { ...base, preferences };
    await check(`T03-${name}`, input, (result) =>
      validateRoute(result, input, false),
    );
  }
  for (const [name, patch, reason] of [
    ["unsupported", { modes: ["CAR"] }, "unsupported_modes"],
    [
      "unknown-place",
      { originId: "00000000-0000-4000-8000-000000000001" },
      "unknown_place",
    ],
    [
      "outside-calendar",
      { departureTime: "2099-01-01T12:00:00Z" },
      "outside_static_service_period",
    ],
  ])
    await check(`T03-${name}`, { ...base, ...patch }, (result) => {
      assert.equal(result.status, "unavailable");
      assert.equal(result.reason, reason);
    });
  if (evidence.graphManifest.feeds?.emt) {
    for (const [network, from, to] of [
      ["emt", "1890", "4676"],
      ["light-rail", "par_10_1", "par_10_9"],
      ["interurban", "par_8_10614", "par_8_17472"],
    ]) {
      const resolveStop = async (query) => {
        const result = await tool("resolve_place", {
          source: network === "emt" ? "emt" : "crtm",
          ...(network !== "emt" ? { network } : {}),
          query,
          limit: 10,
        });
        const place = result.places.find((p) =>
          p.identifiers.some((i) => i.externalId === query),
        );
        assert.ok(place, `Missing ${network} stop ${query}`);
        return place;
      };
      const a = await resolveStop(from),
        b = await resolveStop(to);
      const input = { ...base, originId: a.id, destinationId: b.id };
      await check(`multioperator-${network}`, input, (result) => {
        validateRoute(result, input, true);
        assert.ok(
          result.itineraries.some((route) =>
            route.legs.some((leg) =>
              leg.trip?.gtfsId.startsWith(`${network}:`),
            ),
          ),
          `Expected ${network} transit evidence`,
        );
      });
      if (network === "interurban") {
        const outer = await tool("resolve_place", {
          source: "crtm",
          network: "light-rail",
          query: "par_10_38",
          limit: 5,
        });
        const outerPlace = outer.places.find((p) =>
          p.identifiers.some((i) => i.externalId === "par_10_38"),
        );
        assert.ok(outerPlace);
        const combined = {
          ...base,
          originId: outerPlace.id,
          destinationId: sol.id,
          preferences: {
            ...base.preferences,
            maxWalkingMinutes: 15,
            maxTransfers: 3,
          },
        };
        await check("multioperator-transfer", combined, (result) => {
          validateRoute(result, combined, true);
          assert.ok(
            result.itineraries.some(
              (route) =>
                new Set(
                  route.legs.flatMap((leg) =>
                    leg.trip ? [leg.trip.gtfsId.split(":")[0]] : [],
                  ),
                ).size > 1,
            ),
          );
          assert.ok(
            result.itineraries.some(
              (route) => route.correspondences?.length > 0,
            ),
          );
        });
      }
    }
  }
  evidence.status = "pass";
} catch {
  evidence.status = "fail";
  process.exitCode = 1;
} finally {
  evidence.finishedAt = new Date().toISOString();
  writeFileSync(
    `${directory}/result.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify(
      {
        status: evidence.status,
        cases: evidence.cases.map(({ caseId, status }) => ({ caseId, status })),
        evidence: `${directory}/result.json`,
        modelCalls: 0,
      },
      null,
      2,
    ),
  );
}
