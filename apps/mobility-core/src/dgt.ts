import { dgtTemporalStatus } from "@mobility/domain";
import { type DgtIncident, dgtAttribution, dgtCoverage } from "./adapters/dgt";
import { database } from "./database";
import { snapshot } from "./mobility";

export async function dgtIncidents(
  input: {
    query?: string | undefined;
    limit: number;
    includeWithdrawn?: boolean | undefined;
  },
  refresh = true,
) {
  const state = await snapshot("dgt-incidents", refresh);
  if (!state)
    return {
      status: "unavailable",
      reason: "no_observation",
      coverage: dgtCoverage,
    };
  const needle = (input.query ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const matches = (i: DgtIncident) =>
    !needle ||
    [
      i.road,
      i.location.start?.province,
      i.location.start?.municipality,
      i.location.end?.province,
      i.location.end?.municipality,
    ].some((v) =>
      v
        ?.normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .includes(needle),
    );
  const current = (state.payload.incidents as DgtIncident[])
    .filter(matches)
    .map((i) => ({
      ...i,
      temporalStatus: dgtTemporalStatus(i),
      withdrawnAt: null as string | null,
    }));
  const removed = input.includeWithdrawn
    ? await database()`SELECT payload,withdrawn_at FROM dgt_incident WHERE withdrawn_at>now()-interval '24 hours' ORDER BY withdrawn_at DESC LIMIT 10000`
    : [];
  const withdrawn = removed
    .filter((r) => matches(r.payload))
    .map((r) => ({
      ...(r.payload as DgtIncident),
      temporalStatus: "withdrawn_from_publication",
      withdrawnAt: new Date(r.withdrawn_at).toISOString(),
    }));
  return {
    status: "available",
    coverage: dgtCoverage,
    ...dgtAttribution,
    provenance: state.provenance,
    freshness: state.freshness,
    provenanceScope:
      "publication; updatedAt is record revision time, not a fresh field observation",
    total: current.length + withdrawn.length,
    incidents: [...current, ...withdrawn].slice(0, input.limit),
    warning:
      "Published active/planned status is not independently verified. End-time conflicts remain explicit. Withdrawal may mean expiry, cancellation or correction; reason and actual end are unknown. Empty results never establish normal traffic. Withdrawals retained up to 24h; no inferred road geometry or routing diversion.",
  };
}
