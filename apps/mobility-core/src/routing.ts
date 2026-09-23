import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { JourneyRequest } from "@mobility/contracts";
import { z } from "zod";
import { database } from "./database";

const time = z.iso.datetime({ offset: true });
async function assertGraphVersion(version: string) {
  const manifest = JSON.parse(
    await readFile(
      resolve(
        process.env.LOCAL_DATA_DIR ?? "../../data",
        "otp/graph-manifest.json",
      ),
      "utf8",
    ),
  );
  if (manifest.staticVersion !== version)
    throw new Error("graph_static_version_mismatch");
}
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
        z.object({ code: z.string(), description: z.string() }),
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
  if (!endpoint) throw new Error("routing_not_configured");
  // Local implementation deliberately cannot make requests to arbitrary hosts.
  const url = new URL(endpoint);
  if (
    process.env.VERCEL ||
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  )
    throw new Error("routing_not_local");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("routing_unavailable");
  const data = await response.json();
  if (data.errors) throw new Error("routing_contract_error");
  return data as unknown;
}

export async function routingPlace(id: string) {
  const [place] =
    await database()`SELECT p.id,p.name, ST_Y(p.location::geometry) AS latitude,ST_X(p.location::geometry) AS longitude, i.source_id,i.external_id FROM canonical_place p JOIN place_external_identifier i ON i.place_id=p.id WHERE p.id=${id} ORDER BY (i.source_id='renfe') DESC LIMIT 1`;
  return place ?? null;
}

export async function planJourney(input: JourneyRequest) {
  const asOf = new Date().toISOString();
  if (input.modes.some((mode) => mode !== "WALK" && mode !== "TRANSIT"))
    return {
      status: "unavailable",
      reason: "unsupported_modes",
      supportedModes: ["TRANSIT", "WALK"],
    };
  const [origin, destination] = await Promise.all([
    routingPlace(input.originId),
    routingPlace(input.destinationId),
  ]);
  if (!origin || !destination)
    return { status: "unavailable", reason: "unknown_place" };
  const date = input.departureTime === "now" ? asOf : input.departureTime;
  const [feed] =
    await database()`SELECT version,manifest FROM static_feed WHERE source_id='renfe' AND service_start<=(${date}::timestamptz AT TIME ZONE 'Europe/Madrid')::date AND service_end>=(${date}::timestamptz AT TIME ZONE 'Europe/Madrid')::date`;
  if (!feed)
    return { status: "unavailable", reason: "outside_static_service_period" };
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
  try {
    await assertGraphVersion(feed.version);
    const raw = await otpQuery(
      `query Journey($origin:PlanLabeledLocationInput!,$destination:PlanLabeledLocationInput!,$date:PlanDateTimeInput,$preferences:PlanPreferencesInput,$modes:PlanModesInput){
      planConnection(origin:$origin,destination:$destination,dateTime:$date,preferences:$preferences,modes:$modes,first:5){
        routingErrors{code description} edges{node{duration start end walkTime numberOfTransfers
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
        modes: {
          direct: input.modes.includes("WALK") ? ["WALK"] : [],
          directOnly: !input.modes.includes("TRANSIT"),
        },
      },
    );
    const result = planSchema.parse(raw).data.planConnection;
    const itineraries = result.edges
      .map((edge) => edge.node)
      .filter(
        (route) =>
          route.walkTime <= input.preferences.maxWalkingMinutes * 60 &&
          route.numberOfTransfers <= input.preferences.maxTransfers,
      )
      .slice(0, 3);
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
  } catch {
    return {
      status: "unavailable",
      reason: "routing_unavailable_or_invalid_response",
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
