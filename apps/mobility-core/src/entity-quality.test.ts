import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("./database", () => ({ database: () => mocks.sql }));
vi.mock("./ingestion", () => ({
  ingest: vi.fn(),
  ingestionEnabled: () => true,
}));

import { bikes, environment, parking, sourceHealth } from "./mobility";

const now = "2026-09-25T12:00:00.000Z";
const old = "2026-09-25T08:00:00.000Z";
let payload: Record<string, unknown>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  payload = {};
  mocks.sql
    .mockReset()
    .mockImplementation(async (query: TemplateStringsArray) => {
      const text = query.join("");
      if (text.includes("mobility_snapshot") && !text.includes("ingestion_job"))
        return [
          {
            payload,
            observed_at: now,
            ingested_at: now,
            raw_reference: "fixture",
          },
        ];
      if (text.includes("ingestion_job"))
        return [
          {
            id: "bicimad",
            source_id: "bicimad",
            observed_at: now,
            ingested_at: now,
            next_due_at: now,
            attempts: 1,
            recovered_leases: 0,
            failures: 0,
            payload,
          },
        ];
      if (text.includes("ingestion_activity"))
        return [{ active_until: now, active: false }];
      return [];
    });
});
afterEach(() => vi.useRealTimers());
it("does not lend a recent parking's time to an old or absent one", async () => {
  payload = {
    parkings: [0, 5, 8, null].map((free, i) => ({
      id: String(i),
      name: `Parking ${i}`,
      address: "Test",
      availability:
        free == null
          ? []
          : [
              {
                category: "total",
                freeSpaces: free,
                observedAt: i === 2 ? old : now,
              },
            ],
    })),
  };
  const result = await parking({ query: "Parking", limit: 10 });
  expect(result).toMatchObject({
    parkings: [
      { availability: [{ freeSpaces: 0 }], freshness: { status: "fresh" } },
      { availability: [{ freeSpaces: 5 }], freshness: { status: "fresh" } },
      { provenance: { observedAt: old }, freshness: { status: "stale" } },
      {
        provenance: null,
        availability: [],
        availabilityStatus: "no_observation",
        freshness: { status: "unavailable" },
      },
    ],
  });
});
it("returns BiciMAD station provenance rather than collection time", async () => {
  payload = {
    stations: [
      { id: "s", name: "Station", observedAt: old, bikes: 0, docks: 2 },
    ],
  };
  expect(await bikes({ limit: 5 })).toMatchObject({
    stations: [
      {
        bikes: 0,
        provenance: { observedAt: old, ingestedAt: now },
        freshness: { status: "stale" },
      },
    ],
  });
});
it("joins air identity to a static catalog but dates each measurement independently", async () => {
  payload = {
    readings: [
      {
        stationId: "4",
        samplingPoint: "28079004_8_8",
        name: "NO2",
        value: 0,
        observedAt: old,
      },
    ],
  };
  expect(await environment({ kind: "air", limit: 5 })).toMatchObject({
    readings: [
      {
        value: 0,
        provenance: { observedAt: old },
        freshness: { status: "stale" },
        stationIdentity: {
          name: "Plaza de España",
          status: "matched_static_catalog",
        },
      },
    ],
  });
});
it("source health does not equate a fresh collection with fresh stations", async () => {
  payload = { stations: [{ observedAt: now }, { observedAt: old }] };
  expect(await sourceHealth("bicimad")).toMatchObject({
    sources: [
      {
        status: "partial_or_unavailable",
        streams: [{ entityCoverage: { total: 2, fresh: 1, stale: 1 } }],
      },
    ],
  });
});

it("does not report live readiness from a fresh header with only stale entities", async () => {
  payload = { stations: [{ observedAt: old }] };
  expect(await sourceHealth("bicimad")).toMatchObject({ liveDataReady: false });
});
it("rejects ambiguous observation selectors and future intervals", async () => {
  expect(
    await environment({
      kind: "weather",
      stationId: "3195",
      placeId: "00000000-0000-4000-8000-000000000001",
      limit: 5,
    }),
  ).toMatchObject({ reason: "ambiguous_observation_selector" });
  expect(
    await environment({
      kind: "weather",
      fromTime: "2026-09-26T12:00:00Z",
      limit: 5,
    }),
  ).toMatchObject({ reason: "future_observations_unavailable" });
  expect(
    await environment({ kind: "weather", stationId: "unknown", limit: 5 }),
  ).toMatchObject({ reason: "unknown_weather_station" });
});
it("returns explicit Retiro station-time freshness from shared weather snapshot", async () => {
  payload = {
    readings: [
      {
        stationId: "3195",
        name: "Retiro",
        latitude: 40.4,
        longitude: -3.7,
        observedAt: old,
        measurements: [],
      },
    ],
  };
  expect(await environment({ kind: "weather", limit: 5 })).toMatchObject({
    selection: { reason: "compatibility_default_retiro" },
    readings: [
      { freshness: { status: "stale" }, provenance: { observedAt: old } },
    ],
    coverage: { knownStations: 25, retainedStations: 1, complete: false },
  });
});
