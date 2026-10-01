import type { Provenance, parkingInputSchema } from "@mobility/contracts";
import {
  parkingCost,
  parkingFreeScenario,
  parkingPriceContext,
} from "@mobility/domain";
import { entityObservation, getFreshness } from "@mobility/provenance";
import type { z } from "zod";
import type { parseParking } from "./adapters/parking";
import { parkingPrices, parkingPriceVersion } from "./catalogs/parking-prices";

type ParkingState = {
  provenance: Provenance;
  payload: { parkings?: ReturnType<typeof parseParking>["parkings"] };
};
const folded = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export function parkingResult(
  state: ParkingState | null,
  input: z.infer<typeof parkingInputSchema>,
) {
  const records = new Map(
    (state?.payload.parkings ?? []).map((p) => [p.id, p]),
  );
  // Static identities are only a fallback for the explicitly verified tariff coverage.
  for (const parking of parkingPrices.parkings) {
    if (!records.has(parking.id))
      records.set(parking.id, {
        id: parking.id,
        name: parking.name,
        address: parking.address,
        latitude: parking.latitude,
        longitude: parking.longitude,
        availability: [],
      });
  }
  const parkings = [...records.values()]
    .filter((p) => {
      if (input.parkingId) return p.id === input.parkingId;
      const identity = parkingPrices.parkings.find(
        (entry) => entry.id === p.id,
      );
      return folded(
        `${p.name} ${p.address} ${(identity?.aliases ?? []).join(" ")}`,
      ).includes(folded(input.query ?? ""));
    })
    .slice(0, input.limit)
    .map((p) => {
      const identity = parkingPrices.parkings.find(
        (entry) => entry.id === p.id,
      );
      const tariff = parkingPrices.tariffs.find(
        (t) => t.id === identity?.tariffId,
      );
      const evidence = state
        ? entityObservation(
            state.provenance,
            p.availability.map((a) => a.observedAt).sort()[0],
            300,
          )
        : { provenance: null, freshness: getFreshness(null, 300) };
      return {
        ...p,
        ...evidence,
        temporalBasis: "oldest_available_category",
        availabilityStatus: p.availability.length
          ? "observed"
          : "no_observation",
        availability: p.availability.map((a) => ({
          ...a,
          ...(state
            ? entityObservation(state.provenance, a.observedAt, 300)
            : {}),
        })),
        price: tariff
          ? {
              status: "available" as const,
              catalogVersion: parkingPriceVersion,
              identitySource: identity?.identitySource,
              tariff,
              temporalContext: parkingPriceContext(
                tariff,
                input.date ?? today(),
              ),
              cost: parkingCost(tariff, input.durationMinutes),
              freeScenario: parkingFreeScenario(tariff, input.durationMinutes),
            }
          : { status: "unavailable" as const, reason: "no_verified_tariff" },
        ...(identity?.operatingNote
          ? { operatingNote: identity.operatingNote }
          : {}),
      };
    });
  return {
    status: parkings.length
      ? "available"
      : input.parkingId
        ? "unknown_parking"
        : "no_matches",
    provenance: state?.provenance ?? null,
    provenanceScope: "availability_collection_only",
    occupancyStatus: state ? "stored_observation" : "unavailable",
    parkings,
    priceCoverage: {
      complete: false,
      verifiedParkings: parkingPrices.parkings.length,
      catalogVersion: parkingPriceVersion,
      vehicleType: "car",
    },
    warning:
      "Participating feed only. Empty availability is not zero spaces. Price evidence is independent of occupancy. No reservation or access guarantee.",
  };
}
