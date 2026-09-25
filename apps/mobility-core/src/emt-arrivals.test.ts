import {
  emtArrivalsInputSchema,
  resolvePlaceInputSchema,
} from "@mobility/contracts";
import { expect, it } from "vitest";
import { presentEmtArrivals } from "./emt-arrivals";

const observedAt = "2026-09-25T14:00:00Z";
const arrival = {
  line: "14",
  destination: "PIO XII",
  destinationEvidence: "provider" as const,
  estimateSecondsAtObservation: 60,
  estimatedArrivalAt: "2026-09-25T14:01:00Z",
  estimateStatus: "estimated" as const,
  distanceMeters: 100,
};
it("subtracts cache age from a fresh estimate but preserves its original value", () => {
  expect(
    presentEmtArrivals(
      [arrival],
      observedAt,
      true,
      Date.parse("2026-09-25T14:00:20Z"),
    )[0],
  ).toMatchObject({ remainingSeconds: 40, estimateSecondsAtObservation: 60 });
});
it("never presents stale or elapsed estimates as live zero-second arrivals", () => {
  expect(presentEmtArrivals([arrival], observedAt, false)[0]).toMatchObject({
    remainingSeconds: null,
    basis: "stale_provider_estimate",
  });
  expect(
    presentEmtArrivals(
      [arrival],
      observedAt,
      true,
      Date.parse("2026-09-25T14:02:00Z"),
    ).length,
  ).toBe(0);
});
it("accepts stop number search scoped to EMT but arrivals require a canonical UUID", () => {
  expect(
    resolvePlaceInputSchema.parse({ query: "1", source: "emt" }).source,
  ).toBe("emt");
  expect(emtArrivalsInputSchema.safeParse({ placeId: "72" }).success).toBe(
    false,
  );
});
