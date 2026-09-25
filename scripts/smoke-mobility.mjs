import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { parseEnv } from "node:util";
import { SignJWT } from "jose";
import postgres from "postgres";

const options = new Map(
  process.argv.slice(2).map((arg) => {
    assert.match(arg, /^--(?:port=\d+|read-only|emt-only|crtm-only)$/);
    const [key, value] = arg.slice(2).split("=");
    return [key, value ?? true];
  }),
);
const port = Number(options.get("port") ?? 3001);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const readOnly = options.has("read-only");
const emtOnly = options.has("emt-only");
const crtmOnly = options.has("crtm-only");
assert.ok(
  !(readOnly && emtOnly),
  "EMT smoke explicitly exercises on-demand refresh",
);
const root = parseEnv(readFileSync(".env.local", "utf8"));
const web = parseEnv(readFileSync("apps/eve-web/.env.local", "utf8"));
const core = parseEnv(readFileSync("apps/mobility-core/.env.local", "utf8"));
if (!["127.0.0.1", "localhost"].includes(new URL(root.DATABASE_URL).hostname))
  throw new Error("Local database required");
const sql =
  readOnly || emtOnly || crtmOnly
    ? null
    : postgres(root.DATABASE_URL, { max: 1 });
const headers = {
  Authorization: `Bearer ${web.MOBILITY_MCP_TOKEN}`,
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};
let id = 0;
async function rpc(method, params) {
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, 200);
  const body = await response.text();
  const data = JSON.parse(
    body.startsWith("event:")
      ? body
          .split("\n")
          .find((s) => s.startsWith("data: "))
          .slice(6)
      : body,
  );
  assert.equal(data.error, undefined);
  return data.result;
}
async function tool(name, args) {
  const data = await rpc("tools/call", { name, arguments: args });
  assert.notEqual(data.isError, true, `${name}: ${data.content?.[0]?.text}`);
  return JSON.parse(data.content[0].text);
}
// Static CRTM regression: no provider requests, model calls or OTP queries.
if (crtmOnly) {
  await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "crtm-smoke", version: "1.0" },
  });
  headers["MCP-Protocol-Version"] = "2025-11-25";
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
  }).format(new Date());
  const evidence = [];
  for (const [network, query] of [
    ["light-rail", "par_10_1"],
    ["interurban", "par_8_09568"],
    ["metro", "est_90_21"],
  ]) {
    const resolved = await tool("resolve_place", {
      source: "crtm",
      network,
      query,
      limit: 5,
    });
    const place = resolved.places.find((p) =>
      p.identifiers.some((i) => i.externalId === query),
    );
    assert.ok(place, `Missing prepared ${network} place`);
    const result = await tool("get_crtm_timetable", {
      placeId: place.id,
      serviceDate: date,
      afterTime: "00:00:00",
      limit: 5,
    });
    assert.equal(result.provenance.realtime, false);
    if (place.provenance.currentServiceEnvelope) {
      assert.equal(result.status, "available");
      assert.ok(result.departures.length > 0);
      assert.ok(
        result.departures.every(
          (d) => d.kind === "scheduled" || d.kind === "frequency_window",
        ),
      );
    } else assert.equal(result.reason, "outside_static_service_period");
    if (network === "metro")
      assert.ok(place.correspondences.some((c) => c.network === "interurban"));
    evidence.push({ network, resolved, result });
  }
  const health = await tool("get_source_health", { source: "crtm" });
  assert.equal(health.sources[0].capability, "static_catalog_and_timetable");
  assert.equal(health.sources[0].staticCatalogs.length, 3);
  mkdirSync("data/evaluation", { recursive: true });
  writeFileSync(
    "data/evaluation/crtm-smoke.json",
    JSON.stringify({ at: new Date().toISOString(), evidence, health }, null, 2),
  );
  console.log(
    "CRTM MCP: resolution, timetables, expired coverage, correspondences and source health passed",
  );
  process.exit(0);
}
// Focused E7 regression using the existing MCP harness; no model or global tick.
if (emtOnly) {
  await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "emt-smoke", version: "1.0" },
  });
  headers["MCP-Protocol-Version"] = "2025-11-25";
  const resolved = await tool("resolve_place", {
    source: "emt",
    query: "72",
    limit: 5,
  });
  const place = resolved.places.find((p) =>
    p.identifiers.some((i) => i.source === "emt" && i.externalId === "72"),
  );
  assert.ok(place, "Import the EMT catalog first");
  assert.ok(place.emtLines.length > 0);
  const first = await tool("get_emt_arrivals", { placeId: place.id, limit: 5 });
  assert.equal(first.status, "available");
  assert.equal(first.freshness.status, "fresh");
  assert.equal(first.provenance.source, "emt");
  const second = await tool("get_emt_arrivals", {
    placeId: place.id,
    limit: 5,
  });
  assert.deepEqual(
    second.provenance,
    first.provenance,
    "Immediate repeat must reuse cached observation",
  );
  assert.ok(
    first.arrivals.every(
      (a) =>
        a.destinationEvidence &&
        a.observedAt &&
        (a.estimatedArrivalAt ||
          a.estimateStatus === "beyond_prediction_horizon"),
    ),
  );
  const invalid = await tool("get_emt_arrivals", {
    placeId: "00000000-0000-4000-8000-000000000000",
  });
  assert.equal(invalid.reason, "current_emt_stop_required");
  const health = await tool("get_source_health", { source: "emt" });
  assert.ok(health.sources[0].stopCatalog.version);
  mkdirSync("data/validation", { recursive: true });
  writeFileSync(
    "data/validation/e7-emt.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        place,
        first,
        cached: second.provenance,
        modelCalls: 0,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    "EMT MCP smoke passed: stop resolution, fresh arrivals, repeated cache, unknown place, source coverage; no model.",
  );
  process.exit(0);
}
const workerToken = await new SignJWT({ scope: "mobility.ingestion.manage" })
  .setProtectedHeader({ alg: "HS256" })
  .setSubject("local-smoke")
  .setIssuer("mobility-local")
  .setAudience("mobility-core")
  .setIssuedAt()
  .setExpirationTime("10m")
  .sign(new TextEncoder().encode(root.MOBILITY_JWT_SECRET));
async function tick(activate = false, token = workerToken) {
  const response = await fetch(`http://127.0.0.1:${port}/internal/ingestion`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ activate }),
    signal: AbortSignal.timeout(100000),
  });
  return { code: response.status, body: await response.json() };
}
try {
  assert.equal(
    (await tick(false, web.MOBILITY_MCP_TOKEN)).code,
    403,
    "Web token must not manage ingestion",
  );
  let before, after;
  if (!readOnly) {
    // This smoke is an operator action; it deliberately closes then opens one local window.
    await sql`UPDATE ingestion_activity SET active_until=now()-interval '1 second'`;
    assert.equal((await tick()).body.status, "idle");
    await sql`UPDATE ingestion_job SET next_due_at=now() WHERE lease_until IS NULL OR lease_until<now()`;
    before = await sql`SELECT count(*)::int AS count FROM mobility_history`;
    const batch = await tick(true);
    assert.equal(batch.code, 200);
    assert.ok(
      batch.body.results.every((r) => r.status !== "error"),
      JSON.stringify(batch.body),
    );
    after = await sql`SELECT count(*)::int AS count FROM mobility_history`;
    const overlap = await Promise.all([tick(), tick()]);
    assert.ok(
      overlap.every((r) =>
        r.body.results.every((j) => j.status === "not_due_or_inactive"),
      ),
      "Duplicate ticks must not fetch again before due",
    );
    const deduplicated =
      await sql`SELECT count(*)::int AS count FROM mobility_history`;
    assert.equal(after[0].count, deduplicated[0].count);
  }

  if (readOnly) {
    const probe = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(probe.status, 200);
    assert.equal(
      (await probe.json()).ingestionEnabled,
      false,
      "Read-only smoke requires INGESTION_ENABLED=false on the target Core",
    );
  }
  await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "local-mobility-smoke", version: "1.0" },
  });
  headers["MCP-Protocol-Version"] = "2025-11-25";
  const atocha = await tool("resolve_place", { query: "Atocha", limit: 10 });
  const chamartin = await tool("resolve_place", {
    query: "Chamartín",
    limit: 10,
  });
  const origin = atocha.places.find((p) => p.kind === "station");
  const destination = chamartin.places.find((p) => p.kind === "station");
  assert.ok(origin && destination);
  const baseJourney = {
    originId: origin.id,
    destinationId: destination.id,
    departureTime: "now",
    modes: ["TRANSIT", "WALK"],
    preferences: {},
  };
  assert.equal(
    (await tool("plan_journey", { ...baseJourney, modes: ["CAR"] })).reason,
    "unsupported_modes",
  );
  assert.equal(
    (
      await tool("plan_journey", {
        ...baseJourney,
        originId: "00000000-0000-4000-8000-000000000001",
      })
    ).reason,
    "unknown_place",
  );
  assert.equal(
    (
      await tool("plan_journey", {
        ...baseJourney,
        departureTime: "2099-01-01T12:00:00Z",
      })
    ).reason,
    "outside_static_service_period",
  );
  const timings = [];
  const routes = [];
  for (const [from, to] of [
    [origin, destination],
    [destination, origin],
  ]) {
    const start = performance.now();
    const route = await tool("plan_journey", {
      originId: from.id,
      destinationId: to.id,
      departureTime: "now",
      modes: ["TRANSIT", "WALK"],
      preferences: {
        maxWalkingMinutes: 20,
        maxTransfers: 2,
        wheelchair: false,
      },
    });
    timings.push(Math.round(performance.now() - start));
    assert.equal(route.status, "available", JSON.stringify(route));
    assert.equal(route.basis, "scheduled");
    assert.equal(route.realtimeApplied, false);
    assert.ok(route.itineraries.length > 0);
    routes.push({
      from: from.name,
      to: to.name,
      itineraries: route.itineraries.length,
      duration: route.itineraries[0].duration,
    });
  }
  const departure = await tool("get_departures", {
    placeId: origin.id,
    limit: 10,
  });
  assert.equal(departure.status, "available", JSON.stringify(departure));
  assert.ok(departure.departures.length > 0);
  const alerts = await tool("get_incidents", { limit: 10 });
  assert.ok(Array.isArray(alerts.incidents));
  const aliases = await Promise.all(
    ["C5", "C-5"].map((line) =>
      tool("get_incidents", { source: "renfe", line, limit: 30 }),
    ),
  );
  assert.deepEqual(
    aliases[0].incidents.map((a) => a.id).sort(),
    aliases[1].incidents.map((a) => a.id).sort(),
  );
  assert.equal(
    (await tool("get_incidents", { source: "renfe", line: "C999" })).status,
    "unknown_line",
  );
  assert.ok(
    departure.departures.every(
      (d) => d.estimatedDeparture !== null || d.departureBasis === "scheduled",
    ),
  );
  if (core.EMT_CLIENT_ID && core.EMT_PASSKEY) {
    const emt = await tool("get_incidents", { source: "emt", limit: 30 });
    assert.equal(emt.provenance.source, "emt");
    assert.ok(Array.isArray(emt.incidents));
    assert.ok(emt.freshness && emt.provenance.observedAt);
    assert.ok(
      emt.incidents.every((a) =>
        ["active", "upcoming", "unknown"].includes(a.temporalStatus),
      ),
    );
    const filtered = await tool("get_incidents", {
      source: "emt",
      line: "27",
      limit: 30,
    });
    assert.ok(filtered.incidents.every((a) => a.lines.includes("27")));
  }
  const bikes = await tool("get_bike_availability", {
    placeId: origin.id,
    limit: 5,
  });
  assert.equal(bikes.stations.length, 5);
  assert.ok(
    bikes.stations.every((b) => b.placeId && b.observedAt && b.freshness),
  );
  const air = await tool("get_environment", { pollutant: "NO2", limit: 5 });
  assert.ok(air.readings.length > 0);
  const weather = core.AEMET_API_KEY
    ? await tool("get_environment", { kind: "weather", stationId: "3195" })
    : null;
  if (weather) {
    assert.equal(weather.provenance.source, "aemet");
    assert.equal(weather.readings.length, 1);
    assert.ok(weather.readings[0].measurements.length > 0);
    assert.ok(weather.readings[0].freshness);
  }
  const traffic = await tool("get_road_state", {
    query: "CASTELLANA",
    limit: 5,
  });
  assert.ok(traffic.sensors.length > 0);
  const history = await tool("get_historical_state", {
    source: "renfe",
    at: new Date().toISOString(),
  });
  const parking = await tool("get_parking", { query: "Recuerdo", limit: 5 });
  assert.ok(parking.parkings.length > 0);
  assert.equal(history.status, "available");
  const health = await tool("get_source_health", {});
  assert.equal(health.ingestionEnabled, !readOnly);
  const report = {
    verifiedAt: new Date().toISOString(),
    routes,
    timingsMs: timings,
    departures: departure.departures.length,
    alerts: alerts.incidents.length,
    bikes: bikes.stations.length,
    air: air.readings.length,
    weather: weather?.readings.length ?? null,
    traffic: traffic.sensors.length,
    parking: parking.parkings.length,
    historyGrowth: readOnly ? null : after[0].count - before[0].count,
    activityWindowAndDuplicateTicks: readOnly ? "not_exercised" : true,
    readOnly,
    endpoint: `http://127.0.0.1:${port}/mcp`,
    auth: true,
    modelCalls: 0,
    cloudCalls: 0,
  };
  if (readOnly) mkdirSync("data/validation", { recursive: true });
  writeFileSync(
    readOnly
      ? "data/validation/e6-mobility-read-only.json"
      : "data/otp/local-validation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql?.end();
}
