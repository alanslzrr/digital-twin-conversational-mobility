import type { ParkingTariff } from "@mobility/contracts";
import { describe, expect, it } from "vitest";
import {
  parkingCost,
  parkingFreeScenario,
  parkingPriceContext,
} from "./parking-prices";

const tariff: ParkingTariff = {
  id: "general",
  vehicleType: "car",
  currency: "EUR",
  vatIncluded: true,
  vatPercent: 21,
  source: "https://www.emtmadrid.es/tarifas",
  checkedAt: "2026-10-01",
  effectiveFrom: "2026-01-01",
  referenceYear: 2026,
  referenceYearBasis: "published_effective_date",
  bands: [
    { fromMinute: 1, toMinute: 30, rateUnitsPerMinute: 513 },
    { fromMinute: 31, toMinute: 90, rateUnitsPerMinute: 464 },
    { fromMinute: 91, toMinute: 660, rateUnitsPerMinute: 615 },
  ],
  flatBand: { fromMinute: 661, toMinute: 1440, amountCents: 3935 },
  maximum: { durationMinutes: 1440, amountCents: 3935 },
  examples: [{ durationMinutes: 120, amountCents: 615 }],
  conditions: [],
};
describe("deterministic parking orientation", () => {
  it("prioritizes official two-hour example over the literal 6.168 euro sum", () => {
    expect(parkingCost(tariff, 120)).toMatchObject({
      status: "estimated",
      amount: 6.15,
      amountCents: 615,
      method: "published_example",
    });
    expect(parkingCost({ ...tariff, examples: [] }, 120)).toMatchObject({
      amountCents: 617,
      method: "calculated_bands",
    });
  });
  it.each([
    [1, 5],
    [29, 149],
    [30, 154],
    [31, 159],
    [89, 428],
    [90, 432],
    [91, 438],
    [659, 3932],
    [660, 3935],
    [661, 3935],
    [1440, 3935],
  ])("covers the minute %i boundary with integer units", (minutes, cents) => {
    expect(parkingCost(tariff, minutes)).toMatchObject({ amountCents: cents });
  });
  it("never invents a duration", () =>
    expect(parkingCost(tariff)).toEqual({ status: "not_requested" }));
  it.each([0, -1, 1441, 1.5, Number.NaN])(
    "rejects unsupported duration %s",
    (minutes) =>
      expect(() => parkingCost(tariff, minutes)).toThrow(
        "invalid_parking_duration",
      ),
  );
  it("offers the published maximum without treating an absent band as a charge", () => {
    const special = {
      ...tariff,
      flatBand: undefined,
      bands: tariff.bands.map((b) =>
        b.fromMinute === 91 ? { ...b, toMinute: 222 } : b,
      ),
      maximum: { durationMinutes: 1440 as const, amountCents: 1800 },
    };
    expect(parkingCost(special, 222)).toMatchObject({
      status: "estimated",
      method: "calculated_bands",
      amountCents: 1244,
    });
    for (const duration of [223, 240, 1440])
      expect(parkingCost(special, duration)).toMatchObject({
        status: "maximum_only",
        amount: 18,
        maximumDurationMinutes: 1440,
        approximate: false,
      });
    expect(parkingCost(special, 120)).toMatchObject({ amount: 6.15 });
  });
  it("applies a lower maximum to complete rules but does not interpolate missing ones", () => {
    expect(
      parkingCost(
        { ...tariff, maximum: { durationMinutes: 1440, amountCents: 1200 } },
        221,
      ),
    ).toMatchObject({ amount: 12 });
  });
  it("keeps orientation in 2027 and clearly labels projection", () => {
    expect(parkingPriceContext(tariff, "2027-01-01")).toMatchObject({
      basis: "projection_at_last_published_prices",
      referenceYear: 2026,
      futurePriceConfirmed: false,
    });
    expect(parkingCost(tariff, 120)).toMatchObject({ amount: 6.15 });
    expect(parkingPriceContext(tariff, "2026-10-01")).toMatchObject({
      basis: "last_published_tariff",
    });
    expect(parkingPriceContext(tariff, "2025-12-31").basis).toBe(
      "projection_at_last_published_prices",
    );
  });
  it("explains the free scenario without applying it to ordinary prices", () => {
    const special = {
      ...tariff,
      parkAndRide: {
        minimumMinutes: 300 as const,
        maximumMinutes: 960 as const,
        source: "https://www.emtmadrid.es/condiciones",
        conditions: ["Transporte público, tique y título del mismo día"],
      },
    };
    for (const minutes of [300, 480, 960])
      expect(parkingFreeScenario(special, minutes)).toMatchObject({
        durationEligible: true,
        status: "conditional",
        amountCents: 0,
        appliedToOrdinaryCost: false,
      });
    for (const minutes of [299, 961])
      expect(parkingFreeScenario(special, minutes)?.durationEligible).toBe(
        false,
      );
    expect(parkingFreeScenario(special)?.durationEligible).toBeNull();
    expect(parkingFreeScenario(tariff, 480)).toBeNull();
    expect(parkingCost(special, 480)).toMatchObject({
      status: "estimated",
      amountCents: 2831,
    });
  });
});
