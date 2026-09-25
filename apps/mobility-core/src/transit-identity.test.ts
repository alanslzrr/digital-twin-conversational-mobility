import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  ingest: vi.fn(),
  departures: vi.fn(),
  place: vi.fn(),
}));
vi.mock("./database", () => ({ database: () => mocks.sql }));
vi.mock("./ingestion", () => ({
  ingest: mocks.ingest,
  ingestionEnabled: () => false,
}));
vi.mock("./routing", () => ({
  scheduledDepartures: mocks.departures,
  routingPlace: mocks.place,
}));

import { departures, incidents } from "./mobility";

const routes = [
  { external_id: "r5", short_name: "C-5" },
  { external_id: "r4a", short_name: "C4a" },
];
let payload: Record<string, unknown>;
let catalog = routes;
let tripRows: object[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
  payload = { alerts: [] };
  catalog = routes;
  tripRows = [];
  mocks.sql.mockReset().mockImplementation((query) => {
    if (
      Array.isArray(query) &&
      typeof query[0] === "string" &&
      !("raw" in query)
    )
      return query;
    const text = query.join("");
    if (text.includes("transit_route")) return Promise.resolve(catalog);
    if (text.includes("transit_trip")) return Promise.resolve(tripRows);
    if (text.includes("mobility_snapshot"))
      return Promise.resolve([
        {
          observed_at: new Date(),
          ingested_at: new Date(),
          payload,
          raw_reference: "test",
        },
      ]);
    throw new Error("Unexpected fixture query");
  });
  mocks.place.mockResolvedValue({ source_id: "renfe", external_id: "a" });
  mocks.departures.mockResolvedValue({
    name: "A",
    staticVersion: "fixture-version",
    stoptimesWithoutPatterns: [
      {
        trip: { gtfsId: "renfe:t", route: { shortName: "C5" } },
        serviceDay: Date.parse("2026-09-25T00:00:00+02:00") / 1000,
        scheduledDeparture: 100,
        headsign: "UNTRUSTED ROUTE LABEL",
      },
    ],
  });
});
it("matches Renfe aliases and distinguishes known no-notices from unknown", async () => {
  const known = await incidents({ source: "renfe", line: "c5", limit: 10 });
  expect(known).toMatchObject({
    status: "available",
    lineIdentity: { status: "known" },
    incidents: [],
  });
  const unknown = await incidents({ source: "renfe", line: "C999", limit: 10 });
  expect(unknown).toMatchObject({
    status: "unknown_line",
    lineIdentity: { status: "unknown" },
  });
});
it("filters notices by resolved identity, without collapsing branches", async () => {
  payload = {
    alerts: [
      { id: "five", routeIds: ["r5"], activePeriods: [] },
      { id: "branch", routeIds: ["r4a"], activePeriods: [] },
    ],
  };
  expect(
    await incidents({ source: "renfe", line: "C-5", limit: 10 }),
  ).toMatchObject({ incidents: [{ id: "five" }] });
});
it("does not claim unknown EMT line from missing catalog or strip zeros", async () => {
  catalog = [];
  payload = {
    alerts: [
      { id: "two", lines: ["2"], endsAt: null },
      { id: "zero", lines: ["002"], endsAt: null },
    ],
  };
  expect(
    await incidents({ source: "emt", line: "2", limit: 10 }),
  ).toMatchObject({
    lineIdentity: { status: "catalog_unavailable" },
    incidents: [{ id: "two" }],
  });
});
it("reports unknown destination instead of trusting a route-like OTP label", async () => {
  expect(await departures("station", 10)).toMatchObject({
    departures: [
      { headsign: null, destination: { name: null, basis: "unknown" } },
    ],
  });
});
it("exposes imported trip destination with version and basis", async () => {
  tripRows = [
    {
      external_id: "t",
      headsign: "",
      destination_evidence: {
        stopHeadsigns: {},
        terminal: { id: "c", name: "Terminal" },
      },
    },
  ];
  expect(await departures("station", 10)).toMatchObject({
    departures: [
      {
        headsign: "Terminal",
        destination: {
          basis: "derived_terminal",
          staticVersion: "fixture-version",
        },
      },
    ],
  });
});

afterEach(() => vi.useRealTimers());
function rt(stopTimeUpdate: object[], extra: Record<string, unknown> = {}) {
  payload = {
    staticVersion: "fixture-version",
    updates: [
      {
        trip: { tripId: "t", startDate: "20260925" },
        observedAt: new Date().toISOString(),
        stopTimeUpdate,
        ...extra,
      },
    ],
  };
}
it("keeps upcoming Renfe notices and labels uncertain periods instead of implying active", async () => {
  const now = Date.now() / 1000;
  payload = {
    alerts: [
      {
        id: "future",
        routeIds: ["r5"],
        activePeriods: [{ start: now + 3600 }],
      },
      { id: "expired", routeIds: ["r5"], activePeriods: [{ end: now - 1 }] },
      { id: "undated", routeIds: ["r5"], activePeriods: [] },
    ],
  };
  expect(
    await incidents({ source: "renfe", line: "C5", limit: 10 }),
  ).toMatchObject({
    incidents: [
      { id: "future", temporalStatus: "upcoming" },
      { id: "undated", temporalStatus: "unknown" },
    ],
  });
});
it("never labels an arrival-only estimate as a realtime departure", async () => {
  rt([{ stopId: "a", arrival: { time: Date.now() / 1000 + 60 } }]);
  expect(await departures("station", 5)).toMatchObject({
    departures: [
      {
        estimatedDeparture: null,
        departureBasis: "scheduled",
        arrivalBasis: "realtime",
        realtimeStatus: "matched",
      },
    ],
  });
});
it.each(["SKIPPED", "NO_DATA"])(
  "does not apply estimates for %s",
  async (scheduleRelationship) => {
    rt([
      {
        stopId: "a",
        scheduleRelationship,
        departure: { time: Date.now() / 1000 + 60 },
      },
    ]);
    expect(await departures("station", 5)).toMatchObject({
      departures: [
        {
          estimatedDeparture: null,
          departureBasis: "scheduled",
          skipped: scheduleRelationship === "SKIPPED" ? true : null,
        },
      ],
    });
  },
);
it("preserves a fresh cancellation without inventing stop estimates", async () => {
  rt([], {
    trip: {
      tripId: "t",
      startDate: "20260925",
      scheduleRelationship: "CANCELED",
    },
  });
  expect(await departures("station", 5)).toMatchObject({
    departures: [
      { cancelled: true, estimatedDeparture: null, basis: "realtime" },
    ],
  });
});
it("declines ambiguous repeated stop IDs", async () => {
  rt([
    { stopId: "a", departure: { time: Date.now() / 1000 + 60 } },
    { stopId: "a", departure: { time: Date.now() / 1000 + 600 } },
  ]);
  expect(await departures("station", 5)).toMatchObject({
    departures: [
      { stopRealtimeStatus: "ambiguous_stop", estimatedDeparture: null },
    ],
  });
});
it("rejects old per-trip RT even under a fresh feed header", async () => {
  rt([{ stopId: "a", departure: { time: Date.now() / 1000 + 60 } }], {
    observedAt: new Date(Date.now() - 60000).toISOString(),
  });
  expect(await departures("station", 5)).toMatchObject({
    departures: [
      {
        realtimeStatus: "stale",
        realtimeProvenance: null,
        estimatedDeparture: null,
        cancelled: null,
      },
    ],
  });
});
it("does not match yesterday's trip or another feed version", async () => {
  rt([], { trip: { tripId: "t", startDate: "20260924" } });
  expect(await departures("station", 5)).toMatchObject({
    departures: [{ realtimeStatus: "no_matching_update" }],
  });
  payload.staticVersion = "old-feed";
  expect(await departures("station", 5)).toMatchObject({
    departures: [{ realtimeStatus: "feed_version_mismatch" }],
  });
});
