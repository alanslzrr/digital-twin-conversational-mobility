import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type JourneyRequest,
  journeyRequestSchema,
  type RoutingFailureReason,
} from "@mobility/contracts";
import { journeyModePolicy } from "@mobility/domain";
import { z } from "zod";
import { database } from "./database";
import { enrichRouting } from "./routing-evidence";
import { coveredFeeds, routingRelease } from "./routing-release";

const time = z.iso.datetime({ offset: true });
class RoutingFailure extends Error {
  constructor(readonly reason: RoutingFailureReason) {
    super(reason);
  }
}

async function assertGraphVersion(version: string) {
  let manifest: { staticVersion: string };
  try {
    manifest = z
      .object({ staticVersion: z.string().min(1) })
      .parse(
        JSON.parse(
          await readFile(
            resolve(
              process.env.LOCAL_DATA_DIR ?? "../../data",
              "otp/graph-manifest.json",
            ),
            "utf8",
          ),
        ),
      );
  } catch {
    throw new RoutingFailure("graph_not_ready");
  }
  if (manifest.staticVersion !== version)
    throw new RoutingFailure("graph_static_version_mismatch");
}

// Verified against the installed OTP 2.10.0 GraphQL schema. Direct must remain
// nonempty even when transitOnly disables walking-only alternatives.
export function otpJourneyModes(
  policy: NonNullable<ReturnType<typeof journeyModePolicy>>,
) {
  return {
    direct: ["WALK"],
    directOnly: !policy.allowTransit,
    transitOnly: !policy.allowWalkingOnly,
    ...(policy.allowTransit
      ? {
          transit: {
            access: ["WALK"],
            egress: ["WALK"],
            transfer: ["WALK"],
          },
        }
      : {}),
  };
}

const routingErrorCodeSchema = z.enum([
  "LOCATION_NOT_FOUND",
  "NO_DIRECT_MODE_CONNECTION",
  "NO_STOPS_IN_RANGE",
  "NO_TRANSIT_CONNECTION",
  "NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW",
  "OUTSIDE_BOUNDS",
  "OUTSIDE_SERVICE_PERIOD",
  "WALKING_BETTER_THAN_TRANSIT",
]);
const itinerarySchema = z.object({
  duration: z.number().nonnegative(),
  start: time,
  end: time,
  walkTime: z.number().nonnegative(),
  numberOfTransfers: z.number().int().nonnegative(),
  legs: z
    .array(
      z.object({
        mode: z.string(),
        from: z.object({
          name: z.string(),
          stop: z.object({ gtfsId: z.string() }).nullable().optional(),
        }),
        to: z.object({
          name: z.string(),
          stop: z.object({ gtfsId: z.string() }).nullable().optional(),
        }),
        serviceDate: z.string().nullable().optional(),
        distance: z.number().optional(),
        start: z.object({ scheduledTime: time }),
        end: z.object({ scheduledTime: time }),
        route: z
          .object({ shortName: z.string().nullable(), gtfsId: z.string() })
          .nullable(),
        trip: z.object({ gtfsId: z.string() }).nullable(),
      }),
    )
    .min(1),
});
const planSchema = z.object({
  data: z.object({
    planConnection: z.object({
      routingErrors: z.array(
        // Only allowlisted codes cross the adapter boundary, not provider text.
        z.object({ code: routingErrorCodeSchema }),
      ),
      edges: z.array(z.object({ node: itinerarySchema })),
    }),
  }),
});
const departureSchema = z.object({
  data: z.object({
    stop: z
      .object({
        name: z.string(),
        stoptimesWithoutPatterns: z.array(
          z.object({
            scheduledDeparture: z.number().int(),
            scheduledArrival: z.number().int(),
            serviceDay: z.number().int(),
            headsign: z.string().nullable(),
            trip: z.object({
              gtfsId: z.string(),
              route: z.object({ shortName: z.string().nullable() }),
            }),
          }),
        ),
      })
      .nullable(),
  }),
});

export async function otpQuery(
  query: string,
  variables: Record<string, unknown>,
) {
  const endpoint = process.env.OTP_URL;
  if (!endpoint) throw new RoutingFailure("routing_not_configured");
  // Local implementation deliberately cannot make requests to arbitrary hosts.
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new RoutingFailure("routing_not_local");
  }
  if (
    process.env.VERCEL ||
    url.protocol !== "http:" ||
    url.username ||
    url.password ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  )
    throw new RoutingFailure("routing_not_local");
  const signal = AbortSignal.timeout(10_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal,
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) throw new RoutingFailure("routing_unavailable");
    const data = z
      .object({ errors: z.array(z.unknown()).optional() })
      .passthrough()
      .parse(await response.json());
    if (data.errors?.length) throw new RoutingFailure("routing_contract_error");
    return data as unknown;
  } catch (error) {
    if (error instanceof RoutingFailure) throw error;
    if (
      signal.aborted ||
      (error instanceof Error && error.name === "TimeoutError")
    )
      throw new RoutingFailure("routing_timeout");
    if (error instanceof SyntaxError || error instanceof z.ZodError)
      throw new RoutingFailure("routing_invalid_response");
    throw new RoutingFailure("routing_unavailable");
  }
}

export async function routingPlace(id: string) {
  const [place] =
    await database()`SELECT p.id,p.name,ST_Y(p.location::geometry) AS latitude,ST_X(p.location::geometry) AS longitude,i.source_id,i.external_id,
    CASE WHEN i.source_id='renfe' THEN 'renfe' ELSE l.feed_id END AS feed_id,coalesce(l.stop_id,i.external_id) AS stop_id
    FROM canonical_place p JOIN place_external_identifier i ON i.place_id=p.id
    LEFT JOIN routing_place_link l ON l.place_id=p.id AND EXISTS(SELECT 1 FROM crtm_feed f WHERE f.dataset_id=l.feed_id AND f.version=l.static_version AND f.enabled)
    WHERE p.id=${id} AND (i.source_id!='renfe' OR EXISTS(SELECT 1 FROM static_feed f WHERE f.source_id='renfe' AND f.version=i.source_version))
    UNION ALL SELECT i.id,s.name,s.latitude,s.longitude,'crtm',s.external_id,s.dataset_id,s.external_id FROM crtm_stop_identity i JOIN crtm_stops s USING(dataset_id,external_id) JOIN crtm_feed f USING(dataset_id) WHERE i.id=${id} AND f.enabled LIMIT 1`;
  return place ?? null;
}

export async function planJourney(request: JourneyRequest) {
  const asOf = new Date().toISOString();
  const parsed = journeyRequestSchema.safeParse(request);
  if (!parsed.success)
    return { status: "unavailable", reason: "invalid_request", asOf };
  const input = parsed.data;
  const policy = journeyModePolicy(input.modes);
  if (!policy)
    return {
      status: "unavailable",
      reason: "unsupported_modes",
      supportedModes: ["TRANSIT", "WALK"],
      asOf,
    };
  try {
    let release: Awaited<ReturnType<typeof routingRelease>>;
    try {
      release = await routingRelease();
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      throw new RoutingFailure(
        reason === "routing_update_in_progress"
          ? "routing_update_in_progress"
          : reason === "graph_static_version_mismatch"
            ? reason
            : "graph_not_ready",
      );
    }
    let origin: Awaited<ReturnType<typeof routingPlace>>;
    let destination: Awaited<ReturnType<typeof routingPlace>>;
    let feed: { version: string; manifest: { coverage: unknown } } | undefined;
    const date = input.departureTime === "now" ? asOf : input.departureTime;
    try {
      [origin, destination] = await Promise.all([
        routingPlace(input.originId),
        routingPlace(input.destinationId),
      ]);
      if (!origin || !destination)
        return { status: "unavailable", reason: "unknown_place", asOf };
      const [row] =
        await database()`SELECT version,manifest FROM static_feed WHERE source_id='renfe' AND service_start<=(${date}::timestamptz AT TIME ZONE 'Europe/Madrid')::date AND service_end>=(${date}::timestamptz AT TIME ZONE 'Europe/Madrid')::date`;
      if (!row && !release)
        return {
          status: "unavailable",
          reason: "outside_static_service_period",
          asOf,
        };
      feed = z
        .object({
          version: z.string().min(1),
          manifest: z.object({ coverage: z.unknown() }),
        })
        .parse(
          row ?? {
            version: release?.staticVersion,
            manifest: { coverage: release?.coverage },
          },
        );
    } catch {
      throw new RoutingFailure("routing_backend_unavailable");
    }
    const networks = release ? coveredFeeds(release, date) : ["renfe"];
    if (policy.allowTransit && !networks.length)
      throw new RoutingFailure("outside_static_service_period");
    const location = (place: NonNullable<typeof origin>) => ({
      label: place.name,
      location:
        (place.feed_id ?? place.source_id) &&
        networks.includes(place.feed_id ?? place.source_id)
          ? {
              stopLocation: {
                stopLocationId: `${place.feed_id ?? place.source_id}:${place.stop_id ?? place.external_id}`,
              },
            }
          : {
              coordinate: {
                latitude: place.latitude,
                longitude: place.longitude,
              },
            },
    });
    await assertGraphVersion(feed.version);
    const raw = await otpQuery(
      `query Journey($origin:PlanLabeledLocationInput!,$destination:PlanLabeledLocationInput!,$date:PlanDateTimeInput,$preferences:PlanPreferencesInput,$modes:PlanModesInput){
      planConnection(origin:$origin,destination:$destination,dateTime:$date,preferences:$preferences,modes:$modes,first:10){
        routingErrors{code} edges{node{duration start end walkTime numberOfTransfers
          legs{mode distance serviceDate from{name stop{gtfsId}}to{name stop{gtfsId}}start{scheduledTime}end{scheduledTime}route{shortName gtfsId}trip{gtfsId}}}}
      }}`,
      {
        origin: location(origin),
        destination: location(destination),
        date: { earliestDeparture: date },
        preferences: {
          accessibility: {
            wheelchair: { enabled: input.preferences.wheelchair },
          },
          transit: {
            transfer: { maximumTransfers: input.preferences.maxTransfers },
            timetable: { excludeRealTimeUpdates: true },
          },
        },
        modes: otpJourneyModes(policy),
      },
    );
    if (release && (await routingRelease())?.releaseId !== release.releaseId)
      throw new RoutingFailure("routing_update_in_progress");
    const result = planSchema.parse(raw).data.planConnection;
    const scheduled = result.edges
      .map((edge) => edge.node)
      .filter(
        (route) =>
          route.walkTime <= input.preferences.maxWalkingMinutes * 60 &&
          route.numberOfTransfers <= input.preferences.maxTransfers &&
          // Defensive check as well as the OTP request flags: never relax modes.
          (route.legs.every((leg) => leg.mode === "WALK")
            ? policy.allowWalkingOnly
            : policy.allowTransit &&
              route.legs.some((leg) => leg.trip !== null) &&
              route.legs.every(
                (leg) => leg.mode === "WALK" || leg.trip !== null,
              )),
      );
    const overlay = release
      ? await enrichRouting(scheduled, feed.version, asOf, date)
      : { itineraries: scheduled, filtered: [], provenance: [] };
    const itineraries = await Promise.all(
      overlay.itineraries.slice(0, 3).map(async (route) => {
        if (!release) return route;
        const legs = await Promise.all(
          route.legs.map(async (leg) => {
            const [network, ...rest] = leg.trip?.gtfsId.split(":") ?? [];
            const tripId = rest.join(":");
            const [frequency] =
              network && network !== "renfe" && leg.trip
                ? await database()`SELECT exact_times,headway_seconds FROM crtm_frequencies WHERE dataset_id=${network} AND trip_id=${tripId} ORDER BY exact_times LIMIT 1`
                : [];
            return {
              ...leg,
              staticVersion: network ? release.feeds[network]?.version : null,
              basis:
                frequency?.exact_times === 0
                  ? "frequency_planning_estimate"
                  : "scheduled",
              headwaySeconds: frequency?.headway_seconds ?? null,
            };
          }),
        );
        const transit = legs
          .map((leg, index) => ({ leg, index }))
          .filter(({ leg }) => leg.trip);
        const correspondences = transit.slice(1).map(({ leg, index }, i) => {
          const previous = transit[i];
          return {
            from: previous?.leg.to.stop?.gtfsId,
            to: leg.from.stop?.gtfsId,
            evidence: "GTFS stops and OTP street walking path",
            walkingSeconds: legs
              .slice((previous?.index ?? 0) + 1, index)
              .reduce(
                (total, l) =>
                  total +
                  (Date.parse(l.end.scheduledTime) -
                    Date.parse(l.start.scheduledTime)) /
                    1000,
                0,
              ),
            identitiesMerged: false,
            accessibilityGuaranteed: false,
          };
        });
        return { ...route, legs, correspondences };
      }),
    );
    if (!itineraries.length) {
      if (
        result.routingErrors.some(
          (error) => error.code === "OUTSIDE_SERVICE_PERIOD",
        )
      )
        throw new RoutingFailure("outside_static_service_period");
      if (
        result.routingErrors.some(
          (error) =>
            error.code === "OUTSIDE_BOUNDS" ||
            error.code === "LOCATION_NOT_FOUND",
        )
      )
        throw new RoutingFailure("routing_outside_coverage");
    }
    return {
      status: itineraries.length ? "available" : "no_route",
      provider: "otp-local-2.10.0",
      asOf,
      basis: overlay.itineraries.some(
        (route) => "realtimeApplied" in route && route.realtimeApplied,
      )
        ? "scheduled_with_partial_realtime"
        : "scheduled",
      realtimeApplied: overlay.itineraries.some(
        (route) => "realtimeApplied" in route && route.realtimeApplied,
      ),
      realtime: {
        provenance: overlay.provenance,
        filtered: overlay.filtered,
        coverage:
          "Matched Renfe trips only; EMT arrival predictions have no verified GTFS trip identity",
      },
      releaseId: release?.releaseId ?? null,
      networks,
      staticVersion: feed.version,
      coverage: release?.coverage ?? feed.manifest.coverage,
      accessibilityGuaranteed: false,
      warnings: [
        release
          ? "Base de horarios previstos; solo se aplican estimaciones e incidencias vigentes con identidad verificada. Frecuencias no equivalen a salidas exactas."
          : "Horarios previstos; consultar incidencias y estimaciones por separado.",
        release
          ? "Metro excluido: horarios caducados. Accesibilidad no garantizada. Correspondencias conservan los identificadores de cada operador."
          : "Sin Metro ni autobuses EMT en este grafo.",
      ],
      itineraries,
      errors: result.routingErrors,
    };
  } catch (error) {
    return {
      status: "unavailable",
      reason:
        error instanceof RoutingFailure
          ? error.reason
          : error instanceof z.ZodError
            ? "routing_invalid_response"
            : "routing_internal_error",
      asOf,
    };
  }
}

export async function scheduledDepartures(stopId: string, limit: number) {
  await routingRelease();
  const [feed] =
    await database()`SELECT version FROM static_feed WHERE source_id='renfe' AND service_start <= (now() AT TIME ZONE 'Europe/Madrid')::date AND service_end >= (now() AT TIME ZONE 'Europe/Madrid')::date`;
  if (!feed) throw new Error("static_feed_missing_or_expired");
  await assertGraphVersion(feed.version);
  const data = departureSchema.parse(
    await otpQuery(
      `query Departures($id:String!,$start:Long!,$limit:Int!){
    stop(id:$id){name stoptimesWithoutPatterns(startTime:$start,timeRange:7200,numberOfDepartures:$limit){
      scheduledDeparture scheduledArrival serviceDay headsign trip{gtfsId route{shortName}}
    }}}`,
      { id: `renfe:${stopId}`, start: Math.floor(Date.now() / 1000), limit },
    ),
  );
  return data.data.stop
    ? { ...data.data.stop, staticVersion: feed.version }
    : null;
}
