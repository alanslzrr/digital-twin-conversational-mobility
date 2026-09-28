import type {
  bikesInputSchema,
  environmentInputSchema,
  incidentsInputSchema,
  roadInputSchema,
  SourceId,
} from "@mobility/contracts";
import {
  alertPeriodStatus,
  type DestinationEvidence,
  ingestionWorkerState,
  type JobId,
  jobPolicies,
  normalizeLine,
  resolveLine,
  sameServiceTrip,
  sourceCatalog,
  tripDestination,
} from "@mobility/domain";
import {
  entityObservation,
  getFreshness,
  temporalCoverage,
} from "@mobility/provenance";
import type { z } from "zod";
import type { parseWeather } from "./adapters/aemet";
import type { parseBicimad } from "./adapters/bicimad";
import type { parseEmtIncidents } from "./adapters/emt";
import type { parseAir, parseTraffic } from "./adapters/madrid";
import type { parseParking } from "./adapters/parking";
import type { parseRenfe } from "./adapters/renfe";
import { airStationIdentity } from "./catalogs/air-stations";
import { crtmHealth, resolveCrtm } from "./crtm";
import { database } from "./database";
import { dgtIncidents } from "./dgt";
import { summarizePayload } from "./evidence-summary";
import { ingest, ingestionEnabled } from "./ingestion";
import { routingPlace, scheduledDepartures } from "./routing";

const iso = (value: Date | string) => new Date(value).toISOString();
export async function snapshot(job: JobId, refresh = true) {
  if (refresh) await ingest(job);
  const [row] =
    await database()`SELECT * FROM mobility_snapshot WHERE job_id=${job}`;
  if (!row) return null;
  const provenance = {
    source: jobPolicies[job].source,
    observedAt: iso(row.observed_at),
    ingestedAt: iso(row.ingested_at),
    quality: "provisional" as const,
    rawReference: row.raw_reference as string,
  };
  return {
    provenance,
    freshness: getFreshness(provenance, jobPolicies[job].maxAge),
    payload: row.payload,
  };
}
const folded = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export async function sourceHealth(source?: SourceId) {
  const jobs =
    await database()`SELECT j.*,s.quality,s.raw_reference,s.payload FROM ingestion_job j LEFT JOIN mobility_snapshot s ON s.job_id=j.id`;
  const [activity] =
    await database()`SELECT active_until,active_until>now() AS active FROM ingestion_activity`;
  const workers = await database()`SELECT id,last_seen_at,
    EXTRACT(EPOCH FROM now()-last_seen_at) AS heartbeat_age_seconds FROM ingestion_worker ORDER BY id`;
  const feeds =
    await database()`SELECT source_id,version,service_start,service_end FROM static_feed`;
  const [emtCatalog] =
    !source || source === "emt"
      ? await database()`SELECT version,fetched_at,imported_at,manifest FROM emt_catalog`
      : [];
  const crtmFeeds = !source || source === "crtm" ? await crtmHealth() : [];
  const sources = sourceCatalog
    .filter((entry) => !source || entry.id === source)
    .map((entry) => {
      const streams = jobs
        .filter((job) => job.source_id === entry.id)
        .map((job) => {
          const id = job.id as JobId;
          const provenance =
            job.observed_at && job.ingested_at
              ? {
                  source: entry.id,
                  observedAt: iso(job.observed_at),
                  ingestedAt: iso(job.ingested_at),
                  quality: "provisional" as const,
                }
              : null;
          const freshness = getFreshness(provenance, jobPolicies[id].maxAge);
          const payload = job.payload ?? {};
          const entityTimes: (string | null)[] | null =
            id === "bicimad"
              ? (payload.stations ?? []).map(
                  (s: { observedAt?: string }) => s.observedAt ?? null,
                )
              : id === "madrid-air"
                ? (payload.readings ?? []).map(
                    (r: { observedAt?: string }) => r.observedAt ?? null,
                  )
                : id === "madrid-parking"
                  ? (payload.parkings ?? []).flatMap(
                      (p: { availability: { observedAt?: string }[] }) =>
                        p.availability.length
                          ? p.availability.map((a) => a.observedAt ?? null)
                          : [null],
                    )
                  : null;
          const entityCoverage =
            provenance && entityTimes
              ? {
                  ...temporalCoverage(
                    provenance,
                    entityTimes,
                    jobPolicies[id].maxAge,
                  ),
                  unit:
                    id === "bicimad"
                      ? "station"
                      : id === "madrid-air"
                        ? "measurement"
                        : "category_or_unobserved_parking",
                }
              : null;
          return {
            id,
            summary: provenance
              ? summarizePayload(id, payload, Date.now(), provenance)
              : null,
            status: job.error_code
              ? "degraded"
              : provenance
                ? freshness.status
                : "not_initialized",
            freshness,
            freshnessScope: "collection_timestamp_only",
            entityCoverage,
            provenance,
            error: job.error_code ?? null,
            nextDueAt: iso(job.next_due_at),
            lastAttemptAt: job.last_attempt_at
              ? iso(job.last_attempt_at)
              : null,
            lastFinishedAt: job.last_finished_at
              ? iso(job.last_finished_at)
              : null,
            lastDurationSeconds:
              job.last_attempt_at && job.last_finished_at
                ? Math.max(
                    0,
                    (new Date(job.last_finished_at).getTime() -
                      new Date(job.last_attempt_at).getTime()) /
                      1000,
                  )
                : null,
            errorStage: job.error_stage ?? null,
            attempts: Number(job.attempts),
            recoveredLeases: Number(job.recovered_leases),
            failures: Number(job.failures),
            leaseUntil: job.lease_until ? iso(job.lease_until) : null,
            execution:
              job.lease_until &&
              new Date(job.lease_until).getTime() > Date.now()
                ? "running"
                : job.lease_token
                  ? "interrupted_awaiting_recovery"
                  : job.error_code
                    ? "backoff"
                    : "scheduled",
          };
        });
      return {
        ...entry,
        capability:
          entry.id === "crtm" && crtmFeeds.length
            ? "static_catalog_and_timetable"
            : streams.length
              ? "dynamic_observations"
              : feeds.some((f) => f.source_id === entry.id)
                ? "static_feed"
                : entry.id === "osm"
                  ? "static_routing_input_not_verified_here"
                  : "not_implemented",
        status:
          entry.id === "crtm"
            ? crtmFeeds.length
              ? crtmFeeds.every((f) => f.currentServiceEnvelope)
                ? "static_available"
                : "partial_or_expired_static_coverage"
              : "not_initialized"
            : streams.length
              ? streams.every(
                  (s) =>
                    s.status === "fresh" &&
                    (!s.entityCoverage || s.entityCoverage.status === "fresh"),
                )
                ? "fresh"
                : "partial_or_unavailable"
              : entry.id === "emt"
                ? "adapter_not_initialized"
                : "not_implemented",
        streams,
        ...(entry.id === "crtm"
          ? {
              staticCatalogs: crtmFeeds,
              realtime: false,
              routingIncluded: false,
            }
          : {}),
        ...(entry.id === "emt"
          ? {
              stopCatalog: emtCatalog ?? null,
              arrivals: {
                strategy: "per_stop_on_demand",
                enabled: ingestionEnabled(),
                freshnessSeconds: 30,
                globalCooldownSeconds: 5,
                coverage:
                  "Only requested stops; source freshness above describes notices, not all bus arrivals. No EMT routing or arrival replay.",
              },
            }
          : {}),
        staticFeed: feeds.find((feed) => feed.source_id === entry.id) ?? null,
      };
    });
  return {
    asOf: new Date().toISOString(),
    liveDataReady: sources.some((s) =>
      s.streams.some(
        (v) =>
          v.status === "fresh" &&
          (!v.entityCoverage || v.entityCoverage.fresh > 0),
      ),
    ),
    ingestionEnabled: ingestionEnabled(),
    activeUntil: activity?.active_until ?? null,
    activityWindow: activity?.active ? "active" : "inactive",
    workers: workers.map((worker) => ({
      lane: worker.id,
      lastSeenAt: worker.last_seen_at ? iso(worker.last_seen_at) : null,
      state: ingestionWorkerState(
        ingestionEnabled(),
        Boolean(activity?.active),
        worker.heartbeat_age_seconds == null
          ? null
          : Number(worker.heartbeat_age_seconds),
      ),
    })),
    sources,
  };
}

export async function resolvePlace(
  query: string,
  limit: number,
  source?: "renfe" | "emt" | "bicimad" | "crtm",
  network?: "metro" | "light-rail" | "interurban" | "emt",
) {
  if (source === "crtm" || (!source && network))
    return resolveCrtm(query, limit, network);
  // Parameterized LIKE with escaped metacharacters, accent-insensitive. Canonical only.
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const places =
    await database()`SELECT p.id,p.name,p.kind,ST_Y(p.location::geometry) AS latitude,ST_X(p.location::geometry) AS longitude,
    jsonb_agg(jsonb_build_object('source',i.source_id,'namespace',i.namespace,'externalId',i.external_id,'sourceVersion',i.source_version)) AS identifiers
    FROM canonical_place p JOIN place_external_identifier i ON i.place_id=p.id
    WHERE (unaccent(lower(p.name)) LIKE unaccent(lower(${pattern})) OR i.external_id=${query})
    AND (${source ?? null}::text IS NULL OR i.source_id=${source ?? null})
    AND i.namespace<>'geocoder.osm'
    AND (i.source_id<>'renfe' OR EXISTS(SELECT 1 FROM static_feed f WHERE f.source_id='renfe' AND f.version=i.source_version))
    AND (i.source_id<>'emt' OR EXISTS(SELECT 1 FROM emt_catalog c WHERE c.version=i.source_version))
    GROUP BY p.id ORDER BY bool_or(i.external_id=${query}) DESC,(unaccent(lower(p.name))=unaccent(lower(${query}))) DESC,(p.kind='station') DESC,p.name LIMIT ${limit}`;
  const crtm = !source ? await resolveCrtm(query, limit) : { places: [] };
  const found = await Promise.all(
    places.map(async (place) => ({
      ...place,
      id: place.id as string,
      emtLines: (
        place.identifiers as { source: string; externalId: string }[]
      ).some((i) => i.source === "emt")
        ? await database()`SELECT r.external_id AS "lineId",r.short_name AS label,s.direction,r.long_name AS headers
          FROM emt_stop_line s JOIN transit_route r ON r.source_id='emt' AND r.external_id=s.line_id
          JOIN place_external_identifier i ON i.source_id='emt' AND i.namespace='api.stop' AND i.external_id=s.stop_id
          WHERE i.place_id=${place.id} ORDER BY r.short_name,s.direction`
        : [],
    })),
  );
  // Keep candidates from both catalogs: never silently choose an operator by name.
  const combined = [...found, ...crtm.places];
  return {
    status: combined.length ? "found" : "not_found",
    places: combined,
    ambiguous: combined.length > 1,
    coverage:
      "Imported Renfe, EMT, BiciMAD and CRTM places; up to limit per catalog. Use source and CRTM network to narrow ambiguity. CRTM UUIDs support timetable and routing where the active graph has valid schedules. Use resolve_address for external geocoding.",
  };
}

type Updates = (NonNullable<
  ReturnType<typeof parseRenfe>["entities"][number]["tripUpdate"]
> & { observedAt: string })[];
export async function departures(placeId: string, limit: number) {
  const place = await routingPlace(placeId);
  if (place?.source_id !== "renfe")
    return { status: "unavailable", reason: "renfe_station_required" };
  const state = await snapshot("renfe-trips");
  try {
    const scheduled = await scheduledDepartures(place.external_id, limit);
    if (!scheduled)
      return { status: "unavailable", reason: "stop_not_in_graph" };
    const tripIds = scheduled.stoptimesWithoutPatterns.flatMap((s) =>
      s.trip.gtfsId.startsWith("renfe:")
        ? [s.trip.gtfsId.slice("renfe:".length)]
        : [],
    );
    const sql = database();
    const tripRows = tripIds.length
      ? await sql`SELECT t.external_id,t.headsign,t.destination_evidence
      FROM transit_trip t JOIN static_feed f ON f.source_id=t.source_id
      WHERE t.source_id='renfe' AND f.version=${scheduled.staticVersion} AND t.external_id IN ${sql(tripIds)}`
      : [];
    const destinations = new Map(tripRows.map((row) => [row.external_id, row]));
    return {
      status: "available",
      station: scheduled.name,
      realtime: state
        ? { provenance: state.provenance, freshness: state.freshness }
        : null,
      departures: scheduled.stoptimesWithoutPatterns.map((s) => {
        const candidate = (state?.payload.updates as Updates | undefined)?.find(
          (u) =>
            `renfe:${u.trip.tripId}` === s.trip.gtfsId &&
            sameServiceTrip(
              { ...u.trip, observedAt: u.observedAt },
              s.trip.gtfsId.slice("renfe:".length),
              s.serviceDay,
            ),
        );
        const realtimeStatus = !state
          ? "unavailable"
          : state.payload.staticVersion !== scheduled.staticVersion
            ? "feed_version_mismatch"
            : state.freshness.status !== "fresh"
              ? "stale"
              : !candidate
                ? "no_matching_update"
                : getFreshness(
                      { ...state.provenance, observedAt: candidate.observedAt },
                      40,
                    ).status !== "fresh"
                  ? "stale"
                  : "matched";
        const update = realtimeStatus === "matched" ? candidate : undefined;
        const stopUpdates =
          update?.stopTimeUpdate?.filter(
            (u) => u.stopId === place.external_id,
          ) ?? [];
        // Without a scheduled stop sequence, repeated stop IDs cannot be matched safely.
        const atStop = stopUpdates.length === 1 ? stopUpdates[0] : undefined;
        const cancelled = update?.trip.scheduleRelationship === "CANCELED";
        const skipped = atStop?.scheduleRelationship === "SKIPPED";
        const hasEstimates =
          !cancelled && !skipped && atStop?.scheduleRelationship !== "NO_DATA";
        const trip = destinations.get(s.trip.gtfsId.slice("renfe:".length));
        const destination = tripDestination(
          trip?.headsign as string | undefined,
          trip?.destination_evidence as DestinationEvidence | null | undefined,
          place.external_id,
        );
        return {
          tripId: s.trip.gtfsId,
          realtimeStatus,
          realtimeProvenance:
            update && state
              ? { ...state.provenance, observedAt: update.observedAt }
              : null,
          stopRealtimeStatus:
            stopUpdates.length > 1
              ? "ambiguous_stop"
              : !atStop
                ? "no_stop_update"
                : atStop.scheduleRelationship === "NO_DATA"
                  ? "no_data"
                  : skipped
                    ? "skipped"
                    : "matched",
          departureBasis:
            hasEstimates && atStop?.departure?.time ? "realtime" : "scheduled",
          arrivalBasis:
            hasEstimates && atStop?.arrival?.time ? "realtime" : "scheduled",
          line: s.trip.route.shortName,
          headsign: destination.name,
          destination: {
            ...destination,
            source: "renfe",
            staticVersion: scheduled.staticVersion,
          },
          scheduledDeparture: new Date(
            (s.serviceDay + s.scheduledDeparture) * 1000,
          ).toISOString(),
          estimatedDeparture:
            hasEstimates && atStop?.departure?.time
              ? new Date(atStop.departure.time * 1000).toISOString()
              : null,
          estimatedArrival:
            hasEstimates && atStop?.arrival?.time
              ? new Date(atStop.arrival.time * 1000).toISOString()
              : null,
          cancelled: update ? cancelled : null,
          skipped:
            atStop && atStop.scheduleRelationship !== "NO_DATA"
              ? skipped
              : null,
          basis:
            cancelled ||
            skipped ||
            (hasEstimates && (atStop?.departure?.time || atStop?.arrival?.time))
              ? "realtime"
              : "scheduled",
        };
      }),
      warning:
        "An arrival estimate is not a departure estimate. Missing RT is not evidence of on-time service.",
    };
  } catch {
    return { status: "unavailable", reason: "routing_unavailable" };
  }
}

export async function incidents(
  input: z.infer<typeof incidentsInputSchema>,
  refresh = true,
) {
  if (input.source === "dgt") {
    if (input.line)
      return {
        status: "unavailable",
        reason: "dgt_requires_road_query_not_transit_line",
      };
    return dgtIncidents(input, refresh);
  }
  const routes =
    await database()`SELECT external_id,short_name FROM transit_route WHERE source_id=${input.source}`;
  const lineIdentity = input.line
    ? resolveLine(
        input.source,
        input.line,
        routes.map((r) => ({
          id: r.external_id as string,
          name: r.short_name as string,
        })),
      )
    : null;
  if (lineIdentity?.status === "unknown")
    return {
      status: "unknown_line",
      lineIdentity,
      incidents: [],
      warning:
        "Line not found in the imported operator catalog; this is not evidence of normal service.",
    };

  if (input.source === "emt") {
    const state = await snapshot("emt-alerts", refresh);
    if (!state)
      return { status: "unavailable", reason: "no_observation", lineIdentity };
    const alerts = state.payload.alerts as ReturnType<
      typeof parseEmtIncidents
    >["alerts"];
    const now = Date.now();
    return {
      status: "available",
      lineIdentity,
      provenance: state.provenance,
      provenanceScope: "collection_only",
      freshness: state.freshness,
      incidents: alerts
        .filter(
          (a) =>
            (!input.line ||
              a.lines.some(
                (line) =>
                  normalizeLine("emt", line) ===
                  normalizeLine("emt", input.line ?? ""),
              )) &&
            (!a.endsAt || Date.parse(a.endsAt) >= now),
        )
        .slice(0, input.limit)
        .map((a) => ({
          ...a,
          temporalStatus:
            !a.startsAt || !a.endsAt || a.startsAt > a.endsAt
              ? "unknown"
              : Date.parse(a.startsAt) > now
                ? "upcoming"
                : "active",
        })),
      warning:
        "EMT published notices including upcoming and uncertain periods; lineIdentity reports whether the imported catalog recognizes the label. Empty results do not establish normal service. Not bus arrival estimates or routing coverage.",
    };
  }
  const state = await snapshot("renfe-alerts", refresh);
  if (!state)
    return { status: "unavailable", reason: "no_observation", lineIdentity };
  const ids = new Set(
    lineIdentity ? lineIdentity.routeIds : routes.map((r) => r.external_id),
  );
  const alerts = state.payload.alerts as {
    id: string;
    title: string;
    description: string;
    routeIds: string[];
    activePeriods: { start?: number; end?: number }[];
  }[];
  const now = Date.now() / 1000;
  return {
    status: "available",
    lineIdentity,
    provenance: state.provenance,
    provenanceScope: "collection_only",
    freshness: state.freshness,
    incidents: alerts
      .map((a) => ({
        ...a,
        temporalStatus: alertPeriodStatus(a.activePeriods, now),
      }))
      .filter(
        (a) =>
          a.routeIds.some((id) => ids.has(id)) &&
          a.temporalStatus !== "expired",
      )
      .slice(0, input.limit),
    warning:
      "Renfe Madrid published notices only, including upcoming and uncertain periods. Absence of published alerts does not guarantee normal operation or accessibility.",
  };
}

export async function bikes(input: z.infer<typeof bikesInputSchema>) {
  const state = await snapshot("bicimad");
  if (!state) return { status: "unavailable", reason: "no_observation" };
  const origin = input.placeId ? await routingPlace(input.placeId) : null;
  if (input.placeId && !origin)
    return { status: "unavailable", reason: "unknown_place" };
  const stations = state.payload.stations as ReturnType<
    typeof parseBicimad
  >["stations"];
  const identifiers =
    await database()`SELECT external_id,place_id FROM place_external_identifier WHERE source_id='bicimad' AND namespace='gbfs.station'`;
  const ids = new Map(identifiers.map((i) => [i.external_id, i.place_id]));
  const selected = stations
    .filter((s) => !input.query || folded(s.name).includes(folded(input.query)))
    .map((s) => ({
      ...s,
      placeId: ids.get(s.id) ?? null,
      ...entityObservation(state.provenance, s.observedAt, 60),
      distanceMeters: origin
        ? Math.round(
            distance(
              origin.latitude,
              origin.longitude,
              s.latitude,
              s.longitude,
            ),
          )
        : null,
    }))
    .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
    .slice(0, input.limit);
  return {
    provenance: state.provenance,
    provenanceScope: "collection_only",
    freshness: state.freshness,
    stations: selected,
    warning:
      "Counts do not guarantee a usable bicycle or dock. Distances are straight-line, not walking routes.",
  };
}
function distance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function environment(
  input: z.infer<typeof environmentInputSchema>,
) {
  if (input.kind === "weather") {
    if (input.pollutant)
      return { status: "unavailable", reason: "pollutant_requires_air_kind" };
    const state = await snapshot("aemet");
    if (!state)
      return { status: "unavailable", reason: "no_weather_observation" };
    const readings = state.payload.readings as ReturnType<
      typeof parseWeather
    >["readings"];
    return {
      provenance: state.provenance,
      provenanceScope: "collection_only",
      readings: readings
        .filter((r) => !input.stationId || r.stationId === input.stationId)
        .slice(0, input.limit)
        .map((r) => ({
          ...r,
          ...entityObservation(state.provenance, r.observedAt, 7200),
        })),
      coverage:
        "AEMET Madrid-Retiro (3195) only. Observations, not forecasts or alerts. periodMinutes=0 means an instantaneous measurement.",
    };
  }
  const state = await snapshot("madrid-air");
  if (!state) return { status: "unavailable", reason: "no_observation" };
  const readings = state.payload.readings as ReturnType<
    typeof parseAir
  >["readings"];
  return {
    provenance: state.provenance,
    provenanceScope: "collection_only",
    readings: readings
      .filter(
        (r) =>
          (!input.stationId || r.stationId === input.stationId) &&
          (!input.pollutant || r.name === input.pollutant),
      )
      .slice(0, input.limit)
      .map((r) => ({
        ...r,
        ...entityObservation(state.provenance, r.observedAt, 7200),
        stationIdentity:
          r.stationIdentity ?? airStationIdentity(r.stationId, r.samplingPoint),
      })),
    coverage:
      "Madrid municipal air monitoring only. Use kind=weather for AEMET observations. Not a health-risk assessment.",
  };
}

export async function roads(input: z.infer<typeof roadInputSchema>) {
  const state = await snapshot("madrid-traffic");
  if (!state) return { status: "unavailable", reason: "no_observation" };
  const sensors = state.payload.sensors as ReturnType<
    typeof parseTraffic
  >["sensors"];
  return {
    provenance: state.provenance,
    provenanceScope: "collection_only",
    freshness: state.freshness,
    sensors: sensors
      .filter((s) => folded(s.name).includes(folded(input.query)))
      .slice(0, input.limit),
    coverage:
      "Madrid municipal traffic sensors; not DGT incidents or a driving-time prediction.",
  };
}

export { history } from "./history";

export async function parking(input: z.infer<typeof roadInputSchema>) {
  const state = await snapshot("madrid-parking");
  if (!state) return { status: "unavailable", reason: "no_observation" };
  const records = state.payload.parkings as ReturnType<
    typeof parseParking
  >["parkings"];
  return {
    provenance: state.provenance,
    provenanceScope: "collection_only",
    parkings: records
      .filter((p) =>
        folded(`${p.name} ${p.address}`).includes(folded(input.query)),
      )
      .slice(0, input.limit)
      .map((p) => ({
        ...p,
        ...entityObservation(
          state.provenance,
          p.availability.map((a) => a.observedAt).sort()[0],
          300,
        ),
        temporalBasis: "oldest_available_category",
        availabilityStatus: p.availability.length
          ? "observed"
          : "no_observation",
        availability: p.availability.map((a) => ({
          ...a,
          ...entityObservation(state.provenance, a.observedAt, 300),
        })),
      })),
    warning:
      "Participating municipal feed only. Empty availability means no reading, not zero free spaces. Check freshness for each category.",
  };
}
