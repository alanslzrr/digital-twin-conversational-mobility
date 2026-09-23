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
