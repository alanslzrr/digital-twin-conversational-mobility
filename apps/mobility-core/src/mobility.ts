import type {
  bikesInputSchema,
  environmentInputSchema,
  incidentsInputSchema,
  roadInputSchema,
  SourceId,
} from "@mobility/contracts";
import {
  type JobId,
  jobPolicies,
  sameServiceTrip,
  sourceCatalog,
} from "@mobility/domain";
import { getFreshness } from "@mobility/provenance";
import type { z } from "zod";
import type { parseWeather } from "./adapters/aemet";
import type { parseBicimad } from "./adapters/bicimad";
import type { parseEmtIncidents } from "./adapters/emt";
import type { parseAir, parseTraffic } from "./adapters/madrid";
import type { parseParking } from "./adapters/parking";
import type { parseRenfe } from "./adapters/renfe";
import { database } from "./database";
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
    await database()`SELECT j.*,s.quality,s.raw_reference FROM ingestion_job j LEFT JOIN mobility_snapshot s ON s.job_id=j.id`;
  const [activity] =
    await database()`SELECT active_until FROM ingestion_activity`;
  const feeds =
    await database()`SELECT source_id,version,service_start,service_end FROM static_feed`;
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
          return {
            id,
            status: job.error_code
              ? "degraded"
              : provenance
                ? freshness.status
                : "not_initialized",
            freshness,
            provenance,
            error: job.error_code ?? null,
            nextDueAt: iso(job.next_due_at),
          };
        });
      return {
        ...entry,
        status: streams.length
          ? streams.every((s) => s.status === "fresh")
            ? "fresh"
            : "partial_or_unavailable"
          : entry.id === "emt"
            ? "adapter_not_initialized"
            : "not_implemented",
        streams,
        staticFeed: feeds.find((feed) => feed.source_id === entry.id) ?? null,
      };
    });
  return {
    asOf: new Date().toISOString(),
    liveDataReady: sources.some((s) =>
      s.streams.some((v) => v.status === "fresh"),
    ),
    ingestionEnabled: ingestionEnabled(),
    activeUntil: activity?.active_until ?? null,
    sources,
  };
}

export async function resolvePlace(query: string, limit: number) {
  // Parameterized LIKE with escaped metacharacters, accent-insensitive. Canonical only.
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const places =
    await database()`SELECT p.id,p.name,p.kind,ST_Y(p.location::geometry) AS latitude,ST_X(p.location::geometry) AS longitude,
    jsonb_agg(jsonb_build_object('source',i.source_id,'externalId',i.external_id)) AS identifiers
    FROM canonical_place p JOIN place_external_identifier i ON i.place_id=p.id
    WHERE unaccent(lower(p.name)) LIKE unaccent(lower(${pattern}))
    GROUP BY p.id ORDER BY (unaccent(lower(p.name))=unaccent(lower(${query}))) DESC,(p.kind='station') DESC,p.name LIMIT ${limit}`;
  return {
    status: places.length ? "found" : "not_found",
    places,
    ambiguous: places.length > 1,
    coverage:
      "Imported Renfe stations and BiciMAD stations only; no arbitrary-address geocoder.",
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
    const updates: Updates =
      state?.freshness.status === "fresh" &&
      state.payload.staticVersion === scheduled.staticVersion
        ? state.payload.updates
        : [];
    return {
      status: "available",
      station: scheduled.name,
      realtime: state
        ? { provenance: state.provenance, freshness: state.freshness }
        : null,
      departures: scheduled.stoptimesWithoutPatterns.map((s) => {
        const update = updates.find(
          (u) =>
            `renfe:${u.trip.tripId}` === s.trip.gtfsId &&
            sameServiceTrip(
              { ...u.trip, observedAt: u.observedAt },
              s.trip.gtfsId.slice("renfe:".length),
              s.serviceDay,
            ) &&
            !!state &&
            getFreshness({ ...state.provenance, observedAt: u.observedAt }, 40)
              .status === "fresh",
        );
        const atStop = update?.stopTimeUpdate?.find(
          (u) => u.stopId === place.external_id,
        );
        const cancelled = update?.trip.scheduleRelationship === "CANCELED";
        const skipped = atStop?.scheduleRelationship === "SKIPPED";
        const hasEstimates =
          !cancelled && !skipped && atStop?.scheduleRelationship !== "NO_DATA";
        return {
          tripId: s.trip.gtfsId,
          line: s.trip.route.shortName,
          headsign: s.headsign,
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

export async function incidents(input: z.infer<typeof incidentsInputSchema>) {
  if (input.source === "emt") {
    const state = await snapshot("emt-alerts");
    if (!state) return { status: "unavailable", reason: "no_observation" };
    const alerts = state.payload.alerts as ReturnType<
      typeof parseEmtIncidents
    >["alerts"];
    const now = Date.now();
    return {
      provenance: state.provenance,
      freshness: state.freshness,
      incidents: alerts
        .filter(
          (a) =>
            (!input.line ||
              a.lines.some(
                (line) => folded(line) === folded(input.line ?? ""),
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
        "EMT published notices only, including upcoming and uncertain periods. Empty results do not establish normal service. Not bus arrival estimates or routing coverage.",
    };
  }
  const state = await snapshot("renfe-alerts");
  if (!state) return { status: "unavailable", reason: "no_observation" };
  const routes =
    await database()`SELECT external_id FROM transit_route WHERE source_id='renfe' AND (${input.line ?? null}::text IS NULL OR lower(short_name)=lower(${input.line ?? ""}))`;
  const ids = new Set(routes.map((r) => r.external_id));
  const alerts = state.payload.alerts as {
    id: string;
    title: string;
    description: string;
    routeIds: string[];
    activePeriods: { start?: number; end?: number }[];
  }[];
  const now = Date.now() / 1000;
  return {
    provenance: state.provenance,
    freshness: state.freshness,
    incidents: alerts
      .filter(
        (a) =>
          a.routeIds.some((id) => ids.has(id)) &&
          (!a.activePeriods.length ||
            a.activePeriods.some(
              (p) => (!p.start || p.start <= now) && (!p.end || p.end >= now),
            )),
      )
      .slice(0, input.limit),
    warning:
      "Renfe Madrid feed only. Absence of published alerts does not guarantee normal operation or accessibility.",
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
      freshness: getFreshness(
        { ...state.provenance, observedAt: s.observedAt },
        60,
      ),
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
      readings: readings
        .filter((r) => !input.stationId || r.stationId === input.stationId)
        .slice(0, input.limit)
        .map((r) => ({
          ...r,
          freshness: getFreshness(
            { ...state.provenance, observedAt: r.observedAt },
            7200,
          ),
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
    readings: readings
      .filter(
        (r) =>
          (!input.stationId || r.stationId === input.stationId) &&
          (!input.pollutant || r.name === input.pollutant),
      )
      .slice(0, input.limit)
      .map((r) => ({
        ...r,
        freshness: getFreshness(
          { ...state.provenance, observedAt: r.observedAt },
          7200,
        ),
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
    freshness: state.freshness,
    sensors: sensors
      .filter((s) => folded(s.name).includes(folded(input.query)))
      .slice(0, input.limit),
    coverage:
      "Madrid municipal traffic sensors; not DGT incidents or a driving-time prediction.",
  };
}

export async function history(source: SourceId, at: string) {
  if (Date.parse(at) > Date.now() || Date.parse(at) < Date.now() - 86400000)
    return { status: "unavailable", reason: "outside_24h_retention" };
  const rows =
    await database()`SELECT DISTINCT ON (h.job_id) h.job_id,h.observed_at,h.ingested_at,h.quality,h.raw_reference,h.payload
    FROM mobility_history h JOIN ingestion_job j ON j.id=h.job_id WHERE j.source_id=${source} AND h.observed_at<=${new Date(at)} ORDER BY h.job_id,h.observed_at DESC`;
  return {
    status: rows.length ? "available" : "unavailable",
    kind: "historical_snapshot_index",
    at,
    observations: rows.map((row) => ({
      job: row.job_id,
      observedAt: iso(row.observed_at),
      ingestedAt: iso(row.ingested_at),
      quality: row.quality,
      rawReference: row.raw_reference,
      categories: Object.fromEntries(
        Object.entries(row.payload as Record<string, unknown>).map(
          ([name, value]) => [
            name,
            Array.isArray(value)
              ? { total: value.length, sample: value.slice(0, 5) }
              : value,
          ],
        ),
      ),
    })),
    note: "Snapshot index only; no interpolation and no claims of live data.",
  };
}

export async function parking(input: z.infer<typeof roadInputSchema>) {
  const state = await snapshot("madrid-parking");
  if (!state) return { status: "unavailable", reason: "no_observation" };
  const records = state.payload.parkings as ReturnType<
    typeof parseParking
  >["parkings"];
  return {
    provenance: state.provenance,
    parkings: records
      .filter((p) =>
        folded(`${p.name} ${p.address}`).includes(folded(input.query)),
      )
      .slice(0, input.limit)
      .map((p) => ({
        ...p,
        availability: p.availability.map((a) => ({
          ...a,
          freshness: getFreshness(
            { ...state.provenance, observedAt: a.observedAt },
            300,
          ),
        })),
      })),
    warning:
      "Participating municipal feed only. Empty availability means no reading, not zero free spaces. Check freshness for each category.",
  };
}
