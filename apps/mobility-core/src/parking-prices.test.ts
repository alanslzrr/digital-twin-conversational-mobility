import { parkingInputSchema } from "@mobility/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parkingPrices } from "./catalogs/parking-prices";
import { parkingResult } from "./parking-prices";

const mocks = vi.hoisted(() => ({ sql: vi.fn(), ingest: vi.fn() }));
vi.mock("./database", () => ({ database: () => mocks.sql }));
vi.mock("./ingestion", () => ({
  ingest: mocks.ingest,
  ingestionEnabled: () => true,
}));

import { parking } from "./mobility";

const now = "2026-10-01T10:00:00.000Z";
const old = "2026-10-01T06:00:00.000Z";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  mocks.sql.mockReset();
  mocks.ingest.mockReset();
});
afterEach(() => vi.useRealTimers());
const input = (values: Record<string, unknown>) =>
  parkingInputSchema.parse(values);
const state = {
  provenance: {
    source: "madrid-parking" as const,
    observedAt: now,
    ingestedAt: now,
    quality: "provisional" as const,
    rawReference: "test",
  },
  payload: {
    parkings: [
      {
        id: "84",
        name: "Plaza Mayor",
        address: "Plaza Mayor",
        latitude: 40.4,
        longitude: -3.7,
        availability: [
          { category: "total", name: "Total", freeSpaces: 0, observedAt: old },
        ],
      },
      {
        id: "68",
        name: "Garaje Centro",
        address: "Relatores",
        latitude: 40.4,
        longitude: -3.7,
        availability: [
          { category: "total", name: "Total", freeSpaces: 12, observedAt: now },
        ],
      },
    ],
  },
};
it("validates one selector, supported car durations and dates", () => {
  for (const invalid of [
    {},
    { query: "Mayor", parkingId: "84" },
    { parkingId: "bad" },
    { parkingId: "84", durationMinutes: 1441 },
    { parkingId: "84", vehicleType: "motorcycle" },
    { query: "Mayor", date: "2027-02-29" },
  ])
    expect(parkingInputSchema.safeParse(invalid).success).toBe(false);
  expect(
    input({ parkingId: "84", durationMinutes: 1440, date: "2027-01-01" }),
  ).toMatchObject({ limit: 10 });
});
it("covers all 15 explicit EMT identities, no duplicate alias or private tariff inheritance", () => {
  expect(parkingPrices.parkings.map((p) => p.id).sort()).toEqual(
    [
      "5",
      "7",
      "9",
      "12",
      "15",
      "22",
      "25",
      "53",
      "67",
      "71",
      "84",
      "99",
      "100",
      "102",
      "103",
    ].sort(),
  );
  expect(
    parkingResult(state, input({ parkingId: "68", durationMinutes: 120 }))
      .parkings[0],
  ).toMatchObject({
    availability: [{ freeSpaces: 12 }],
    price: { status: "unavailable", reason: "no_verified_tariff" },
  });
  expect(parkingPrices.parkings.find((p) => p.id === "11")).toBeUndefined();
});
it.each([
  ["22", 18],
  ["7", 20],
  ["5", 25],
  ["103", 15],
])(
  "uses the special tariff for parking %s rather than general",
  (parkingId, maximum) => {
    const result = parkingResult(
      null,
      input({ parkingId, durationMinutes: 480 }),
    );
    expect(result.parkings[0]?.price).toMatchObject({
      status: "available",
      cost: { status: "maximum_only", amount: maximum },
      tariff: { maximum: { amountCents: maximum * 100 } },
    });
  },
);
it("keeps prices without any occupancy and preserves known IDs for exact reopening", () => {
  const result = parkingResult(
    null,
    input({ query: "Mayor", durationMinutes: 120 }),
  );
  expect(result).toMatchObject({
    status: "available",
    occupancyStatus: "unavailable",
    provenance: null,
    parkings: [
      {
        id: "84",
        availability: [],
        availabilityStatus: "no_observation",
        freshness: { status: "unavailable" },
        price: { status: "available", cost: { amount: 6.15 } },
      },
    ],
  });
  expect(
    parkingResult(null, input({ parkingId: "84" })).parkings[0]?.price,
  ).toMatchObject({ cost: { status: "not_requested" } });
});
it("does not let new occupancy rejuvenate prices or old occupancy", () => {
  const result = parkingResult(
    state,
    input({ parkingId: "84", durationMinutes: 120 }),
  );
  expect(result.parkings[0]).toMatchObject({
    availability: [{ freeSpaces: 0 }],
    freshness: { status: "stale" },
    provenance: { observedAt: old },
    price: {
      tariff: { checkedAt: "2026-10-01", effectiveFrom: "2026-01-01" },
      cost: { amount: 6.15 },
    },
  });
});
it("keeps future orientation instead of turning off at year change", () => {
  expect(
    parkingResult(
      null,
      input({ parkingId: "84", durationMinutes: 120, date: "2027-02-01" }),
    ).parkings[0]?.price,
  ).toMatchObject({
    cost: { amount: 6.15 },
    temporalContext: {
      basis: "projection_at_last_published_prices",
      referenceYear: 2026,
    },
  });
});
it("exposes conditional gratuity only on participating parkings, not ordinary charges", () => {
  const result = parkingResult(
    null,
    input({ parkingId: "103", durationMinutes: 480 }),
  );
  expect(result.parkings[0]?.price).toMatchObject({
    freeScenario: {
      status: "conditional",
      durationEligible: true,
      appliedToOrdinaryCost: false,
      conditions: expect.arrayContaining([expect.stringContaining("tique")]),
    },
    cost: { amount: 15, status: "maximum_only" },
  });
  expect(
    parkingResult(null, input({ parkingId: "84", durationMinutes: 480 }))
      .parkings[0]?.price,
  ).toMatchObject({ freeScenario: null });
});
it("records Pitis public campaign separately, not from SOAP zeros", () => {
  expect(
    parkingResult(null, input({ parkingId: "102", durationMinutes: 120 }))
      .parkings[0]?.price,
  ).toMatchObject({
    tariff: { id: "pitis-campaign", effectiveFrom: null },
    freeScenario: null,
    cost: { amount: 0 },
  });
});
it("resolves Fuente de la Mora alias and keeps closure information", () => {
  expect(
    parkingResult(null, input({ query: "Fuente de la Mora" })).parkings[0]?.id,
  ).toBe("103");
  expect(
    parkingResult(null, input({ parkingId: "15" })).parkings[0]?.operatingNote,
  ).toContain("cerrado por obras");
  expect(parkingResult(null, input({ parkingId: "999999" })).status).toBe(
    "unknown_parking",
  );
});
it("degrades independently when stored occupancy cannot be read", async () => {
  mocks.sql.mockRejectedValue(new Error("occupancy unavailable"));
  expect(
    await parking(input({ parkingId: "84", durationMinutes: 120 })),
  ).toMatchObject({
    occupancyStatus: "unavailable",
    parkings: [{ price: { cost: { amount: 6.15 } } }],
  });
});
it("repeated prices read the versioned file, never fetching a tariff provider", async () => {
  mocks.sql.mockResolvedValue([]);
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("unexpected fetch"));
  try {
    const first = await parking(
      input({ parkingId: "84", durationMinutes: 120 }),
    );
    const second = await parking(
      input({ parkingId: "84", durationMinutes: 120 }),
    );
    expect(first.parkings[0]?.price).toEqual(second.parkings[0]?.price);
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore();
  }
});
