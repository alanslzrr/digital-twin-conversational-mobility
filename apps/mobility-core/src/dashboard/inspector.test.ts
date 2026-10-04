import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), activate: vi.fn() }));
vi.mock("../ingestion", () => ({ activate: mocks.activate }));
vi.mock("../mobility", () =>
  Object.fromEntries(
    [
      "bikes",
      "departures",
      "environment",
      "incidents",
      "parking",
      "resolvePlace",
      "roads",
      "sourceHealth",
    ].map((name) => [name, mocks.read]),
  ),
);
vi.mock("../aggregates", () => ({
  lineStatus: mocks.read,
  networkStatus: mocks.read,
  mobilitySnapshot: mocks.read,
}));
vi.mock("../crtm", () => ({ crtmTimetable: mocks.read }));
vi.mock("../emt-arrivals", () => ({ emtArrivals: mocks.read }));
vi.mock("../geocoding", () => ({ resolveAddress: mocks.read }));
vi.mock("../history", () => ({ historicalQuery: mocks.read }));
vi.mock("../routing", () => ({
  planJourney: () => {
    throw new Error("OTP forbidden");
  },
}));

import { inspectStored } from "./inspector";

beforeEach(() => {
  mocks.read.mockReset().mockResolvedValue({ status: "available" });
  mocks.activate.mockReset().mockImplementation(() => {
    throw new Error("Activation forbidden");
  });
});
it("dispatches all stored selectors without activation and disables acquisition explicitly", async () => {
  const cases = [
    ["resolve_place", { query: "Sol" }, ["Sol", 5, undefined, undefined]],
    [
      "resolve_address",
      { query: "Puerta del Sol", allowExternal: true },
      ["Puerta del Sol", false],
    ],
    [
      "get_emt_arrivals",
      { placeId: "00000000-0000-4000-8000-000000000001" },
      ["00000000-0000-4000-8000-000000000001", 5, false],
    ],
    ["get_incidents", {}, [{ source: "renfe", limit: 10 }, false]],
    ["get_bike_availability", {}, [{ limit: 5 }, false]],
    ["get_environment", {}, [{ kind: "air", limit: 10 }, false]],
    [
      "get_road_state",
      { query: "Alcalá" },
      [{ query: "Alcalá", limit: 10 }, false],
    ],
    [
      "get_parking",
      { query: "Centro" },
      [{ query: "Centro", limit: 10 }, false],
    ],
    ["get_source_health", {}, [undefined]],
    ["get_network_status", {}, [undefined]],
    ["get_mobility_snapshot", {}, [undefined]],
    [
      "get_line_status",
      { source: "renfe", line: "C-5" },
      [{ source: "renfe", line: "C-5", limit: 5 }],
    ],
    [
      "get_crtm_timetable",
      { placeId: "00000000-0000-4000-8000-000000000001" },
      [{ placeId: "00000000-0000-4000-8000-000000000001", limit: 10 }],
    ],
    [
      "get_historical_state",
      { source: "renfe", minutesAgo: 10 },
      [{ source: "renfe", minutesAgo: 10, mode: "event" }],
    ],
  ] as const;
  for (const [tool, input, args] of cases) {
    const result = await inspectStored({ tool, input });
    expect(result).toMatchObject({
      tool,
      executionMode: "stored_only",
      availability: "available",
    });
    expect(mocks.read).toHaveBeenLastCalledWith(...args);
  }
  expect(mocks.activate).not.toHaveBeenCalled();
});
it("never fabricates a route or full departures when OTP would be required", async () => {
  const placeId = "00000000-0000-4000-8000-000000000001";
  for (const [tool, input] of [
    [
      "plan_journey",
      {
        originId: placeId,
        destinationId: placeId,
        departureTime: "now",
        modes: ["TRANSIT"],
        preferences: {},
      },
    ],
    ["get_departures", { placeId }],
  ]) {
    expect(await inspectStored({ tool, input })).toMatchObject({
      availability: "not_materialized",
      result: null,
    });
  }
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.activate).not.toHaveBeenCalled();
});
it("does not label provider unavailability as a successful stored reading", async () => {
  mocks.read.mockResolvedValue({
    status: "unavailable",
    reason: "no_observation",
  });
  expect(
    await inspectStored({ tool: "get_bike_availability", input: {} }),
  ).toMatchObject({ availability: "unavailable" });
  await expect(
    inspectStored({ tool: "force_ingest", input: {} }),
  ).rejects.toThrow();
  expect(mocks.read).toHaveBeenCalledOnce();
});
