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
        from: z.object({ name: z.string() }),
        to: z.object({ name: z.string() }),
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
    await database()`SELECT p.id,p.name, ST_Y(p.location::geometry) AS latitude,ST_X(p.location::geometry) AS longitude, i.source_id,i.external_id FROM canonical_place p JOIN place_external_identifier i ON i.place_id=p.id WHERE p.id=${id} ORDER BY (i.source_id='renfe') DESC LIMIT 1`;
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
      if (!row)
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
        .parse(row);
    } catch {
      throw new RoutingFailure("routing_backend_unavailable");
    }
    const location = (place: NonNullable<typeof origin>) => ({
      label: place.name,
      location:
        place.source_id === "renfe"
          ? { stopLocation: { stopLocationId: `renfe:${place.external_id}` } }
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
      planConnection(origin:$origin,destination:$destination,dateTime:$date,preferences:$preferences,modes:$modes,first:5){
        routingErrors{code} edges{node{duration start end walkTime numberOfTransfers
          legs{mode from{name}to{name}start{scheduledTime}end{scheduledTime}route{shortName gtfsId}trip{gtfsId}}}}
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
    const result = planSchema.parse(raw).data.planConnection;
    const itineraries = result.edges
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
      )
      .slice(0, 3);
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
      basis: "scheduled",
      realtimeApplied: false,
      staticVersion: feed.version,
      coverage: feed.manifest.coverage,
      accessibilityGuaranteed: false,
      warnings: [
        "Horarios previstos; consultar incidencias y estimaciones por separado.",
        "Sin Metro ni autobuses EMT en este grafo.",
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
