import {
  gtfsClock,
  gtfsInstant,
  gtfsServiceEpoch,
  madridDate,
} from "@mobility/domain";
import type postgres from "postgres";
import { accessibilityFrom, readAccessibility } from "./accessibility";
import { database } from "./database";

type Network = "metro" | "light-rail" | "interurban" | "emt";
type Sql = postgres.TransactionSql;
type Place = {
  id: string;
  dataset_id: Network;
  external_id: string;
  name: string;
  latitude: number;
  longitude: number;
  parent_id: string | null;
  location_type: number;
  wheelchair: number;
  version: string;
  fetched_at: Date;
  published_at: Date;
  imported_at: Date;
  service_start: string;
  service_end: string;
  manifest: { sourceUrl: string; termsUrl: string; attribution: string };
};
const coverage =
  "Static CRTM catalogs/timetables only; no RT, routing or guaranteed accessible transfers. Operating companies are not identified by these feeds. Correspondences cover published CRTM station identities, not EMT/Renfe mappings.";
function provenance(p: Place) {
  return {
    source: "crtm",
    network: p.dataset_id,
    staticVersion: p.version,
    fetchedAt: p.fetched_at.toISOString(),
    publishedAt: p.published_at.toISOString(),
    ingestedAt: p.imported_at.toISOString(),
    ageSeconds: Math.max(
      0,
      Math.floor((Date.now() - p.fetched_at.getTime()) / 1000),
    ),
    serviceStart: p.service_start,
    serviceEnd: p.service_end,
    currentServiceEnvelope:
      madridDate() >= p.service_start && madridDate() <= p.service_end,
    sourceUrl: p.manifest.sourceUrl,
    termsUrl: p.manifest.termsUrl,
    attribution: p.manifest.attribution,
    quality: "static_schedule",
    realtime: false,
  };
}
async function correspondences(sql: Sql, p: Place) {
  // Same published station identifier AND spatial agreement; never name matching.
  const station = p.location_type === 1 ? p.external_id : p.parent_id;
  if (!station) return [];
  return sql`SELECT i.id, s.dataset_id AS network,s.external_id AS "externalId",s.name,
    'published_parent_station_id_and_coordinates' AS evidence,
    CASE WHEN s.dataset_id=anchor.dataset_id THEN 'parent_station' ELSE 'cross_network_station' END AS relationship,
    f.version AS "staticVersion",f.service_end::text AS "serviceEnd",
    ${madridDate()}::date BETWEEN f.service_start AND f.service_end AS "currentServiceEnvelope"
    FROM crtm_stops anchor JOIN crtm_stops s ON s.external_id=anchor.external_id AND s.location_type=1
    JOIN crtm_stop_identity i ON i.dataset_id=s.dataset_id AND i.external_id=s.external_id
    JOIN crtm_feed f ON f.dataset_id=s.dataset_id
    WHERE f.enabled AND anchor.dataset_id=${p.dataset_id} AND anchor.external_id=${station} AND anchor.location_type=1
    AND (s.dataset_id<>${p.dataset_id} OR s.external_id<>${p.external_id})
    AND ST_DWithin(ST_SetSRID(ST_MakePoint(anchor.longitude,anchor.latitude),4326)::geography,
      ST_SetSRID(ST_MakePoint(s.longitude,s.latitude),4326)::geography,100)
    ORDER BY s.dataset_id LIMIT 10`;
}
export async function resolveCrtm(
  query: string,
  limit: number,
  network?: Network,
) {
  return database().begin(
    "isolation level repeatable read read only",
    async (sql) => {
      await sql`SET LOCAL statement_timeout = '10s'`;
      const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
      const places = await sql<
        Place[]
      >`SELECT s.*,i.id,f.version,f.fetched_at,f.published_at,f.imported_at,
      f.service_start::text,f.service_end::text,f.manifest FROM crtm_stops s
      JOIN crtm_stop_identity i USING(dataset_id,external_id) JOIN crtm_feed f USING(dataset_id)
      WHERE f.enabled AND s.location_type<>2 AND (${network ?? null}::text IS NULL OR s.dataset_id=${network ?? null})
      AND (unaccent(lower(s.name)) LIKE unaccent(lower(${pattern})) OR s.external_id=${query} OR s.stop_code=${query})
      ORDER BY (s.external_id=${query} OR coalesce(s.stop_code=${query},false)) DESC,
      (unaccent(lower(s.name))=unaccent(lower(${query}))) DESC,(s.location_type=1) DESC,s.name,s.dataset_id,s.external_id LIMIT ${limit}`;
      const stopRef = (p: Place) => ({
        feed: p.dataset_id,
        version: p.version,
        entity: "stop" as const,
        externalId: p.external_id,
      });
      const accessibility = await readAccessibility(places.map(stopRef), sql);
      return {
        status: places.length ? "found" : "not_found",
        ambiguous: places.length > 1,
        coverage,
        places: await Promise.all(
          places.map(async (p) => ({
            id: p.id,
            name: p.name,
            kind: p.location_type === 1 ? "station" : "stop",
            latitude: p.latitude,
            longitude: p.longitude,
            network: p.dataset_id,
            identifiers: [
              {
                source: "crtm",
                namespace: `gtfs.${p.dataset_id}.stop`,
                externalId: p.external_id,
                sourceVersion: p.version,
              },
            ],
            provenance: provenance(p),
            wheelchairBoardingCode: p.wheelchair,
            accessibility: accessibilityFrom(accessibility, stopRef(p)),
            correspondences: await correspondences(sql, p),
          })),
        ),
      };
    },
  );
}
export async function crtmTimetable(input: {
  placeId: string;
  serviceDate?: string | undefined;
  afterTime?: string | undefined;
  limit: number;
}) {
  const today = madridDate();
  const date = input.serviceDate ?? today;
  const after = input.afterTime
    ? input.afterTime.split(":").reduce((sum, n) => sum * 60 + Number(n), 0)
    : date === today
      ? Math.max(0, Math.floor((Date.now() - gtfsServiceEpoch(date)) / 1000))
      : 0;
  return database().begin(
    "isolation level repeatable read read only",
    async (sql) => {
      await sql`SET LOCAL statement_timeout = '10s'`;
      const [p] = await sql<
        Place[]
      >`SELECT s.*,i.id,f.version,f.fetched_at,f.published_at,f.imported_at,
      f.service_start::text,f.service_end::text,f.manifest FROM crtm_stops s
      JOIN crtm_stop_identity i USING(dataset_id,external_id) JOIN crtm_feed f USING(dataset_id) WHERE f.enabled AND i.id=${input.placeId}`;
      if (!p)
        return {
          status: "unavailable",
          reason: "current_crtm_place_required",
          coverage,
        };
      const context = {
        place: { id: p.id, name: p.name, network: p.dataset_id },
        serviceDate: date,
        afterTime: gtfsClock(after),
        timezone: "Europe/Madrid",
        provenance: provenance(p),
        coverage,
      };
      if (date < p.service_start || date > p.service_end)
        return {
          ...context,
          status: "unavailable",
          reason: "outside_static_service_period",
        };
      if (p.location_type === 2)
        return {
          ...context,
          status: "unavailable",
          reason: "boarding_stop_required",
        };
      const rows = await sql`WITH active AS (
      SELECT t.* FROM crtm_trips t LEFT JOIN crtm_calendar c USING(dataset_id,service_id)
      LEFT JOIN crtm_exceptions e ON e.dataset_id=t.dataset_id AND e.service_id=t.service_id AND e.date=${date}::date
      WHERE t.dataset_id=${p.dataset_id} AND CASE WHEN e.exception_type IS NOT NULL THEN e.exception_type=1
        ELSE ${date}::date BETWEEN c.start_date AND c.end_date AND extract(isodow FROM ${date}::date)::integer=ANY(c.weekdays) END
    ), candidates AS (
      SELECT st.*, t.route_id,t.headsign AS trip_headsign,t.direction,t.wheelchair AS trip_wheelchair,
        r.short_name AS line,r.long_name AS line_name, s.name AS stop_name,
        f.start_seconds,f.end_seconds,f.headway_seconds,f.exact_times,
        st.departure_seconds-first_time.departure_seconds AS stop_offset
      FROM active t JOIN crtm_stop_times st ON st.dataset_id=t.dataset_id AND st.trip_id=t.external_id
      JOIN crtm_stops s ON s.dataset_id=st.dataset_id AND s.external_id=st.stop_id
      JOIN crtm_routes r ON r.dataset_id=t.dataset_id AND r.external_id=t.route_id
      LEFT JOIN crtm_frequencies f ON f.dataset_id=t.dataset_id AND f.trip_id=t.external_id
      LEFT JOIN LATERAL (SELECT departure_seconds FROM crtm_stop_times first_stop
        WHERE first_stop.dataset_id=t.dataset_id AND first_stop.trip_id=t.external_id ORDER BY sequence LIMIT 1) first_time ON true
      WHERE (s.external_id=${p.external_id} OR (${p.location_type}=1 AND s.parent_id=${p.external_id}))
        AND st.pickup_type<>1 AND st.departure_seconds IS NOT NULL
        AND EXISTS(SELECT 1 FROM crtm_stop_times onward WHERE onward.dataset_id=st.dataset_id
          AND onward.trip_id=st.trip_id AND onward.sequence>st.sequence)
    ) SELECT * FROM candidates WHERE (start_seconds IS NULL AND departure_seconds>=${after})
      OR (start_seconds IS NOT NULL AND stop_offset>=0 AND end_seconds+stop_offset>${after})
      ORDER BY CASE WHEN start_seconds IS NULL THEN departure_seconds ELSE greatest(start_seconds+stop_offset,${after}) END,
        trip_id,sequence,start_seconds LIMIT ${input.limit + 1}`;
      const stopRef = (id: string) => ({
        feed: p.dataset_id,
        version: p.version,
        entity: "stop" as const,
        externalId: id,
      });
      const tripRef = (id: string) => ({
        feed: p.dataset_id,
        version: p.version,
        entity: "trip" as const,
        externalId: id,
      });
      const accessibility = await readAccessibility(
        rows
          .slice(0, input.limit)
          .flatMap((r) => [stopRef(r.stop_id), tripRef(r.trip_id)]),
        sql,
      );
      return {
        ...context,
        status: "available",
        truncated: rows.length > input.limit,
        emptyReason: rows.length
          ? null
          : "no_boardable_departures_in_requested_service_day_after_time",
        departures: rows.slice(0, input.limit).map((r) => ({
          tripId: r.trip_id,
          stopId: r.stop_id,
          stopName: r.stop_name,
          stopSequence: r.sequence,
          lineId: r.route_id,
          line: r.line ?? r.line_name,
          direction: r.direction,
          destination: r.headsign || r.trip_headsign || null,
          destinationEvidence: r.headsign
            ? "stop_headsign"
            : r.trip_headsign
              ? "trip_headsign"
              : "unknown",
          pickupType: r.pickup_type,
          wheelchairAccessibleCode: r.trip_wheelchair,
          accessibility: {
            boarding: accessibilityFrom(accessibility, stopRef(r.stop_id)),
            vehicle: accessibilityFrom(accessibility, tripRef(r.trip_id)),
          },
          ...(r.start_seconds === null
            ? {
                kind: "scheduled",
                timepoint: r.timepoint,
                departureTime: gtfsInstant(date, r.departure_seconds),
                serviceTime: gtfsClock(r.departure_seconds),
              }
            : {
                kind: "frequency_window",
                exactTimes: r.exact_times,
                headwaySeconds: r.headway_seconds,
                startTime: gtfsInstant(date, r.start_seconds + r.stop_offset),
                endTimeExclusive: gtfsInstant(
                  date,
                  r.end_seconds + r.stop_offset,
                ),
                startServiceTime: gtfsClock(r.start_seconds + r.stop_offset),
                endServiceTimeExclusive: gtfsClock(
                  r.end_seconds + r.stop_offset,
                ),
                note: "Template stop offset applied; window is not a realtime arrival or an individual departure.",
              }),
        })),
        limits:
          "Only the requested GTFS service day, including >24h times; adjacent service days are not searched. Terminal visits without a subsequent stop and non-timed stops are omitted, not interpolated. Pickup codes 2/3 require arrangements. Accessibility codes are not an operational guarantee.",
      };
    },
  );
}

export async function crtmHealth() {
  const today = madridDate();
  return database()`SELECT dataset_id AS network,version,fetched_at AS "fetchedAt",published_at AS "publishedAt",
    imported_at AS "ingestedAt",service_start::text AS "serviceStart",service_end::text AS "serviceEnd",
    ${today}::date BETWEEN service_start AND service_end AS "currentServiceEnvelope",
    manifest->>'sourceUrl' AS "sourceUrl",manifest->>'termsUrl' AS "termsUrl",manifest->>'attribution' AS attribution
    FROM crtm_feed WHERE enabled ORDER BY dataset_id`;
}
