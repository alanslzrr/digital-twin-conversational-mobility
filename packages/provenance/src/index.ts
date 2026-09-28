import { type Provenance, provenanceSchema } from "@mobility/contracts";

export type Freshness = {
  status: "fresh" | "stale" | "unavailable";
  ageSeconds: number | null;
  reason?: "missing_observation" | "invalid_timestamp" | "future_observation";
};

export function getFreshness(
  observation: Provenance | null,
  maxAgeSeconds: number,
  now = new Date(),
): Freshness {
  if (
    !Number.isFinite(maxAgeSeconds) ||
    maxAgeSeconds < 0 ||
    !Number.isFinite(now.getTime())
  ) {
    throw new RangeError(
      "A valid clock and non-negative maximum age are required",
    );
  }
  if (!observation) {
    return {
      status: "unavailable",
      ageSeconds: null,
      reason: "missing_observation",
    };
  }
  if (!provenanceSchema.safeParse(observation).success) {
    return {
      status: "unavailable",
      ageSeconds: null,
      reason: "invalid_timestamp",
    };
  }
  const ageMs = now.getTime() - Date.parse(observation.observedAt);
  if (ageMs < -30_000) {
    return {
      status: "unavailable",
      ageSeconds: null,
      reason: "future_observation",
    };
  }
  return {
    status: Math.max(0, ageMs) <= maxAgeSeconds * 1_000 ? "fresh" : "stale",
    ageSeconds: Math.floor(Math.max(0, ageMs) / 1_000),
  };
}

// Entity time never falls back to the collection's newest observation.
export function entityObservation(
  collection: Provenance,
  observedAt: string | null | undefined,
  maxAgeSeconds: number,
  now = new Date(),
) {
  const provenance = observedAt ? { ...collection, observedAt } : null;
  return {
    provenance,
    freshness: getFreshness(provenance, maxAgeSeconds, now),
  };
}

export function temporalCoverage(
  collection: Provenance,
  times: readonly (string | null | undefined)[],
  maxAgeSeconds: number,
  now = new Date(),
) {
  const states = times.map((time) =>
    entityObservation(collection, time, maxAgeSeconds, now),
  );
  const counts = { total: times.length, fresh: 0, stale: 0, unavailable: 0 };
  for (const state of states) counts[state.freshness.status]++;
  return {
    ...counts,
    status:
      counts.total === 0
        ? "unavailable"
        : counts.fresh === counts.total
          ? "fresh"
          : "partial_or_unavailable",
  };
}
export { weatherFreshness } from "./weather";
