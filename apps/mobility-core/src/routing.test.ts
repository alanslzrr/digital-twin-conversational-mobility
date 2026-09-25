import {
  type JourneyRequest,
  journeyRequestSchema,
  routingFailureReasonSchema,
} from "@mobility/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { planJourney, scheduledDepartures } from "./routing";

const mocks = vi.hoisted(() => ({ sql: vi.fn(), readFile: vi.fn() }));
vi.mock("./database", () => ({ database: () => mocks.sql }));
vi.mock("node:fs/promises", async (original) => ({
  ...(await original<typeof import("node:fs/promises")>()),
  readFile: mocks.readFile,
}));

// Synthetic offline fixture, never used as a runtime itinerary.
const itinerary = {
  duration: 780,
  start: "2026-09-25T08:10:00Z",
  end: "2026-09-25T08:23:00Z",
  walkTime: 0,
  numberOfTransfers: 0,
  legs: [
    {
      mode: "RAIL",
      from: { name: "Test origin" },
      to: { name: "Test destination" },
      start: { scheduledTime: "2026-09-25T08:10:00Z" },
      end: { scheduledTime: "2026-09-25T08:23:00Z" },
      route: { shortName: "C5", gtfsId: "renfe:test-route" },
      trip: { gtfsId: "renfe:test-trip" },
    },
  ],
};
const request = journeyRequestSchema.parse({
  originId: "00000000-0000-4000-8000-000000000001",
  destinationId: "00000000-0000-4000-8000-000000000002",
  departureTime: "2026-09-25T08:08:58.823Z",
  modes: ["TRANSIT"],
  preferences: { maxWalkingMinutes: 15, maxTransfers: 2, wheelchair: false },
});
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("OTP_URL", "http://127.0.0.1:8801/otp/gtfs/v1");
  vi.stubEnv("VERCEL", "");
  mocks.sql
    .mockReset()
    .mockImplementation(async (query: TemplateStringsArray) =>
      query.join("").includes("static_feed")
        ? [{ version: "test-feed", manifest: { coverage: "Offline fixture" } }]
        : [
            {
              name: "Test station",
              source_id: "renfe",
              external_id: "test-stop",
            },
          ],
    );
  mocks.readFile
    .mockReset()
    .mockResolvedValue(JSON.stringify({ staticVersion: "test-feed" }));
  fetchMock.mockReset().mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    // Actual GraphQL error reproduced against OTP 2.10.0 in the audit.
    if (!body.variables.modes.direct.length)
      return Response.json({
        errors: [{ message: "Direct modes must not be empty." }],
      });
    return Response.json({
      data: {
        planConnection: {
          routingErrors: [],
          edges: [{ node: itinerary }],
        },
      },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("F01: TRANSIT alone returns a scheduled route instead of an OTP contract error", async () => {
  expect(await planJourney(request)).toMatchObject({
    status: "available",
    basis: "scheduled",
    realtimeApplied: false,
    itineraries: [itinerary],
  });
});

const walking = {
  ...itinerary,
  walkTime: 300,
  legs: itinerary.legs.map((leg) => ({
    ...leg,
    mode: "WALK",
    route: null,
    trip: null,
  })),
};

it("classifies a deadline during body decoding even when the transport throws AbortError", async () => {
  const deadline = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  fetchMock.mockImplementation(async () => {
    const response = Response.json({});
    vi.spyOn(response, "json").mockImplementation(async () => {
      deadline.abort();
      throw new DOMException("private-body-timeout", "AbortError");
    });
    return response;
  });
  expect(await planJourney(request)).toMatchObject({
    reason: "routing_timeout",
  });
});
function respond(nodes: unknown[] = [], errors: unknown[] = []) {
  fetchMock.mockImplementation(async () =>
    Response.json({
      data: {
        planConnection: {
          routingErrors: errors,
          edges: nodes.map((node) => ({ node })),
        },
      },
    }),
  );
}
function variables() {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).variables;
}

it.each([
  {
    modes: ["TRANSIT"],
    directOnly: false,
    transitOnly: true,
    expected: [itinerary],
  },
  {
    modes: ["TRANSIT", "WALK"],
    directOnly: false,
    transitOnly: false,
    expected: [itinerary, walking],
  },
  {
    modes: ["WALK"],
    directOnly: true,
    transitOnly: false,
    expected: [walking],
  },
] as const)(
  "maps $modes and enforces permitted itinerary kinds",
  async ({ modes, directOnly, transitOnly, expected }) => {
    respond([itinerary, walking]);
    expect(await planJourney({ ...request, modes: [...modes] })).toMatchObject({
      status: "available",
      itineraries: expected,
    });
    expect(variables().modes).toEqual({
      direct: ["WALK"],
      directOnly,
      transitOnly,
      ...(!directOnly
        ? {
            transit: { access: ["WALK"], egress: ["WALK"], transfer: ["WALK"] },
          }
        : {}),
    });
  },
);

it("does not substitute a walking-only route for TRANSIT", async () => {
  respond([walking]);
  expect(await planJourney(request)).toMatchObject({
    status: "no_route",
    itineraries: [],
  });
});
it("rejects unexpected non-walking access even when the itinerary contains transit", async () => {
  respond([
    {
      ...itinerary,
      legs: [...itinerary.legs, { ...walking.legs[0], mode: "CAR" }],
    },
  ]);
  expect(await planJourney(request)).toMatchObject({
    status: "no_route",
    itineraries: [],
  });
});

it.each([0, 15])(
  "enforces the total walking budget at %i minutes, including the boundary",
  async (minutes) => {
    const allowed = { ...itinerary, walkTime: minutes * 60 };
    respond([allowed, { ...itinerary, walkTime: minutes * 60 + 1 }]);
    expect(
      await planJourney({
        ...request,
        preferences: { ...request.preferences, maxWalkingMinutes: minutes },
      }),
    ).toMatchObject({ itineraries: [allowed] });
  },
);
it.each([0, 2])(
  "enforces %i transfers both in OTP and after response",
  async (maxTransfers) => {
    const allowed = { ...itinerary, numberOfTransfers: maxTransfers };
    respond([allowed, { ...itinerary, numberOfTransfers: maxTransfers + 1 }]);
    expect(
      await planJourney({
        ...request,
        preferences: { ...request.preferences, maxTransfers },
      }),
    ).toMatchObject({ itineraries: [allowed] });
    expect(variables().preferences.transit.transfer.maximumTransfers).toBe(
      maxTransfers,
    );
  },
);
it.each([false, true])(
  "forwards wheelchair=%s without guaranteeing operational accessibility",
  async (wheelchair) => {
    expect(
      await planJourney({
        ...request,
        preferences: { ...request.preferences, wheelchair },
      }),
    ).toMatchObject({ accessibilityGuaranteed: false });
    expect(variables().preferences.accessibility.wheelchair.enabled).toBe(
      wheelchair,
    );
    expect(
      variables().preferences.transit.timetable.excludeRealTimeUpdates,
    ).toBe(true);
  },
);
it("caps returned itineraries at three only after filtering", async () => {
  respond([walking, itinerary, itinerary, itinerary, itinerary]);
  expect(await planJourney(request)).toMatchObject({
    itineraries: [itinerary, itinerary, itinerary],
  });
});
it.each([
  "2026-09-26T12:00:00+02:00",
  "2026-10-25T02:30:00+02:00",
  "2026-10-25T02:30:00+01:00",
])(
  "preserves the requested instant %s (calendar availability is the DB's responsibility)",
  async (departureTime) => {
    await planJourney({ ...request, departureTime });
    expect(variables().date).toEqual({ earliestDeparture: departureTime });
    const call = mocks.sql.mock.calls.find(([query]) =>
      query.join("").includes("static_feed"),
    );
    expect(call?.slice(1)).toEqual([departureTime, departureTime]);
    expect(call?.[0].join("")).toContain("AT TIME ZONE 'Europe/Madrid'");
  },
);
it("resolves now once and uses the same instant for calendar and OTP", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(request.departureTime));
  expect(await planJourney({ ...request, departureTime: "now" })).toMatchObject(
    { asOf: request.departureTime },
  );
  expect(variables().date.earliestDeparture).toBe(request.departureTime);
});

it.each([
  { modes: [] },
  { departureTime: "invalid" },
  { originId: "not-a-uuid" },
  { preferences: { ...request.preferences, maxWalkingMinutes: -1 } },
  { preferences: { ...request.preferences, maxTransfers: 7 } },
])(
  "rejects invalid input before touching dependencies: %j",
  async (invalid) => {
    expect(await planJourney({ ...request, ...invalid })).toMatchObject({
      status: "unavailable",
      reason: "invalid_request",
    });
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  },
);
it.each<JourneyRequest["modes"]>([["BIKE"], ["CAR"], ["TRANSIT", "CAR"]])(
  "rejects unsupported modes %j before dependencies",
  async (...modes) => {
    expect(await planJourney({ ...request, modes })).toMatchObject({
      reason: "unsupported_modes",
    });
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  },
);
it("distinguishes unknown places from no route", async () => {
  mocks.sql.mockResolvedValueOnce([]);
  expect(await planJourney(request)).toMatchObject({ reason: "unknown_place" });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("returns a calendar failure without consulting OTP when the feed is unavailable for the date", async () => {
  mocks.sql
    .mockResolvedValueOnce([{ source_id: "renfe", external_id: "a" }])
    .mockResolvedValueOnce([{ source_id: "renfe", external_id: "b" }])
    .mockResolvedValueOnce([]);
  expect(await planJourney(request)).toMatchObject({
    reason: "outside_static_service_period",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("sanitizes database failures rather than misreporting no routes", async () => {
  mocks.sql.mockRejectedValue(new Error("private-db-connection"));
  expect(await planJourney(request)).toMatchObject({
    reason: "routing_backend_unavailable",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each(["not-json", "{}", '{"staticVersion":"other-feed"}'])(
  "fails closed for manifest %s",
  async (manifest) => {
    mocks.readFile.mockResolvedValue(manifest);
    expect(await planJourney(request)).toMatchObject({
      reason: manifest.includes("other-feed")
        ? "graph_static_version_mismatch"
        : "graph_not_ready",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  },
);
it("distinguishes a missing graph manifest", async () => {
  mocks.readFile.mockRejectedValue(
    new Error("private/path/graph-manifest.json"),
  );
  expect(await planJourney(request)).toMatchObject({
    reason: "graph_not_ready",
  });
});

it.each([
  ["", "routing_not_configured"],
  ["https://example.invalid", "routing_not_local"],
  ["invalid", "routing_not_local"],
  ["http://user:private@127.0.0.1:8801", "routing_not_local"],
])("rejects unsupported OTP endpoint %s", async (endpoint, reason) => {
  vi.stubEnv("OTP_URL", endpoint);
  expect(await planJourney(request)).toMatchObject({ reason });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("does not call OTP on Vercel", async () => {
  vi.stubEnv("VERCEL", "1");
  expect(await planJourney(request)).toMatchObject({
    reason: "routing_not_local",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each([
  [new DOMException("private-timeout", "TimeoutError"), "routing_timeout"],
  [new TypeError("private-network-error"), "routing_unavailable"],
])(
  "classifies transport failures without exposing details",
  async (error, reason) => {
    fetchMock.mockRejectedValue(error);
    const result = await planJourney(request);
    expect(result).toMatchObject({ status: "unavailable", reason });
    expect(JSON.stringify(result)).not.toContain("private-");
  },
);
it.each([301, 400, 503])(
  "classifies HTTP %i and forbids redirects/retries",
  async (status) => {
    fetchMock.mockResolvedValue(new Response("private-upstream", { status }));
    expect(await planJourney(request)).toMatchObject({
      reason: "routing_unavailable",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      redirect: "error",
      cache: "no-store",
    });
  },
);
it("distinguishes GraphQL HTTP200 errors from no_route, even with partial data", async () => {
  fetchMock.mockResolvedValue(
    Response.json({ errors: [{ message: "private-graphql" }], data: {} }),
  );
  const result = await planJourney(request);
  expect(result).toMatchObject({ reason: "routing_contract_error" });
  expect(JSON.stringify(result)).not.toContain("private-");
});
it.each([
  "not-json",
  "null",
  "[]",
  "{}",
  '{"data":{"planConnection":{"routingErrors":[],"edges":[{"node":{}}]}}}',
])("rejects malformed payload: %s", async (body) => {
  fetchMock.mockResolvedValue(new Response(body));
  expect(await planJourney(request)).toMatchObject({
    reason: "routing_invalid_response",
  });
});
it.each([
  "NO_DIRECT_MODE_CONNECTION",
  "NO_STOPS_IN_RANGE",
  "NO_TRANSIT_CONNECTION",
  "NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW",
  "WALKING_BETTER_THAN_TRANSIT",
])(
  "preserves legitimate no_route with code %s and removes provider text",
  async (code) => {
    respond([], [{ code, description: "private-provider-detail" }]);
    const result = await planJourney(request);
    expect(result).toMatchObject({
      status: "no_route",
      errors: [{ code }],
      itineraries: [],
    });
    expect(JSON.stringify(result)).not.toContain("private-");
  },
);
it.each([
  ["OUTSIDE_SERVICE_PERIOD", "outside_static_service_period"],
  ["OUTSIDE_BOUNDS", "routing_outside_coverage"],
  ["LOCATION_NOT_FOUND", "routing_outside_coverage"],
  ["UNKNOWN_NEW_ERROR", "routing_invalid_response"],
])("classifies OTP routing code %s", async (code, reason) => {
  respond([], [{ code }]);
  const result = await planJourney(request);
  expect(result).toMatchObject({ status: "unavailable", reason });
  expect(routingFailureReasonSchema.safeParse(reason).success).toBe(true);
});
it("keeps a usable itinerary when OTP also reports a branch with no connection", async () => {
  respond(
    [itinerary],
    [{ code: "NO_DIRECT_MODE_CONNECTION", description: "private-detail" }],
  );
  expect(await planJourney(request)).toMatchObject({
    status: "available",
    itineraries: [itinerary],
    errors: [{ code: "NO_DIRECT_MODE_CONNECTION" }],
  });
});
it("accepts a well-formed empty search without pretending infrastructure failed", async () => {
  respond();
  expect(await planJourney(request)).toMatchObject({
    status: "no_route",
    itineraries: [],
    errors: [],
  });
});
it("keeps the shared OTP transport compatible with scheduled departures", async () => {
  fetchMock.mockResolvedValue(
    Response.json({
      errors: [],
      data: { stop: { name: "Test station", stoptimesWithoutPatterns: [] } },
    }),
  );
  expect(await scheduledDepartures("test-stop", 5)).toEqual({
    name: "Test station",
    stoptimesWithoutPatterns: [],
    staticVersion: "test-feed",
  });
});
