import type { Provenance } from "@mobility/contracts";
import { dgtTemporalStatus, type JobId, jobPolicies } from "@mobility/domain";
import { entityObservation } from "@mobility/provenance";
import type { DgtIncident } from "./adapters/dgt";
// Only stored snapshots; never call the default refreshing path. Counts describe
// retained evidence, not passengers, network throughput or guaranteed availability.
export function summarizePayload(
  job: JobId,
  payload: Record<string, unknown>,
  now = Date.now(),
  provenance?: Provenance,
) {
  const arrays = Object.entries(payload).filter(
    (entry): entry is [string, unknown[]] => Array.isArray(entry[1]),
  );
  const totals = Object.fromEntries(
    arrays.map(([key, value]) => [key, value.length]),
  );
  if (job === "dgt-incidents") {
    const states: Record<string, number> = {};
    for (const incident of (payload.incidents ?? []) as DgtIncident[]) {
      const state = dgtTemporalStatus(incident, now);
      states[state] = (states[state] ?? 0) + 1;
    }
    return {
      totals,
      publishedValidity: states,
      coverage: payload.coverage,
      attribution: payload.attribution,
      sourceUrl: payload.sourceUrl,
      termsUrl: payload.termsUrl,
    };
  }
  if (!provenance) return { totals };
  const keys = [
    "id",
    "stationId",
    "name",
    "pollutant",
    "unit",
    "value",
    "bikes",
    "docks",
    "vehiclesPerHour",
    "occupancyPercent",
    "serviceLevel",
    "observedAt",
  ];
  const samples = arrays
    .filter(([key]) =>
      ["stations", "readings", "parkings", "sensors"].includes(key),
    )
    .flatMap(([kind, rows]) =>
      rows.slice(0, 2).map((value) => {
        const row = value as Record<string, unknown>;
        const selected = Object.fromEntries(
          keys.filter((key) => key in row).map((key) => [key, row[key]]),
        );
        const entityProvenance = row.provenance as Provenance | undefined;
        const observation =
          typeof row.observedAt === "string"
            ? row.observedAt
            : job === "madrid-traffic"
              ? provenance.observedAt
              : null;
        return {
          kind,
          ...selected,
          ...entityObservation(
            entityProvenance ?? provenance,
            observation,
            jobPolicies[job].maxAge,
            new Date(now),
          ),
          ...(Array.isArray(row.measurements)
            ? { measurements: row.measurements.slice(0, 8) }
            : {}),
          ...(Array.isArray(row.availability)
            ? {
                availability: row.availability
                  .slice(0, 5)
                  .map((a: { observedAt?: string }) => ({
                    ...a,
                    ...entityObservation(
                      provenance,
                      a.observedAt,
                      jobPolicies[job].maxAge,
                      new Date(now),
                    ),
                  })),
              }
            : {}),
        };
      }),
    );
  return {
    totals,
    ...(job === "aemet"
      ? { coverage: payload.coverage, catalogVersion: payload.catalogVersion }
      : {}),
    samples,
    sampleScope:
      "At most two retained entities per stream, not representative or necessarily fresh; parking freshness belongs to each availability category.",
  };
}
