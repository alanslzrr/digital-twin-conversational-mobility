import type { SourceId } from "@mobility/contracts";

export {
  ingestionWorkerState,
  type JobId,
  jobPolicies,
  localIngestionEnabled,
  retryDelay,
} from "./ingestion";
export { alertPeriodStatus, sameServiceTrip } from "./realtime";
export { journeyModePolicy } from "./routing";

export const sourceCatalog: ReadonlyArray<{
  id: SourceId;
  strategy: "continuous" | "snapshot" | "hybrid";
  access: "public" | "credentials_required" | "partial_realtime_access";
}> = [
  { id: "renfe", strategy: "continuous", access: "public" },
  { id: "emt", strategy: "hybrid", access: "credentials_required" },
  { id: "bicimad", strategy: "continuous", access: "public" },
  { id: "crtm", strategy: "snapshot", access: "partial_realtime_access" },
  { id: "aemet", strategy: "continuous", access: "credentials_required" },
  { id: "dgt", strategy: "continuous", access: "public" },
  { id: "madrid-air", strategy: "continuous", access: "public" },
  { id: "madrid-traffic", strategy: "continuous", access: "public" },
  { id: "madrid-parking", strategy: "continuous", access: "public" },
  { id: "osm", strategy: "snapshot", access: "public" },
];

// Until adapters persist observations, availability is explicitly unknown.
// A catalog entry is NOT evidence that a feed is reachable or licensed.
export function getSourceHealth(source?: SourceId) {
  return {
    asOf: new Date().toISOString(),
    liveDataReady: false,
    sources: sourceCatalog
      .filter((entry) => !source || entry.id === source)
      .map((entry) => ({
        ...entry,
        status: "not_initialized" as const,
        lastObservedAt: null,
        ageSeconds: null,
      })),
  };
}

export type RoutingResult =
  | {
      status: "unavailable";
      reason: "provider_not_configured" | "graph_not_ready";
    }
  | {
      status: "available";
      // Introduce the itinerary contract alongside the first verified provider.
      provider: string;
      itineraries: ReadonlyArray<{
        durationSeconds: number;
        departureTime: string;
        arrivalTime: string;
      }>;
    };

export {
  type DestinationEvidence,
  deriveDestinationEvidence,
  normalizeLine,
  resolveLine,
  tripDestination,
} from "./transit-identity";
