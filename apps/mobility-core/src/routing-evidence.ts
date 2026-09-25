import {
  applyRoutingEvidence,
  type RoutingLeg,
  routingObservationFresh,
} from "@mobility/domain";
import { z } from "zod";
import { database } from "./database";

const event = z.object({
  time: z.number().optional(),
  delay: z.number().optional(),
});
const trip = z.object({
  tripId: z.string(),
  startDate: z.string().optional(),
  scheduleRelationship: z.string().optional(),
});
const update = z.object({
  trip,
  observedAt: z.string(),
  stopTimeUpdate: z
    .array(
      z.object({
        stopId: z.string(),
        scheduleRelationship: z.string().optional(),
        arrival: event.optional(),
        departure: event.optional(),
      }),
    )
    .optional(),
});
const alert = z.object({
  id: z.string(),
  title: z.string(),
  effect: z.string(),
  activePeriods: z.array(
    z.object({ start: z.number().optional(), end: z.number().optional() }),
  ),
  selectors: z
    .array(
      z.object({
        routeId: z.string().optional(),
        stopId: z.string().optional(),
        trip: trip.optional(),
      }),
    )
    .optional(),
});
export async function routingEvidence(version: string, now: string) {
  const rows =
    await database()`SELECT job_id,observed_at,ingested_at,payload FROM mobility_snapshot WHERE job_id IN ('renfe-trips','renfe-alerts')`;
  const get = (job: string, maxAge: number) =>
    rows.find(
      (row) =>
        row.job_id === job &&
        row.payload.staticVersion === version &&
        routingObservationFresh(
          new Date(row.observed_at).toISOString(),
          now,
          maxAge,
        ),
    );
  const trips = get("renfe-trips", 40),
    alerts = get("renfe-alerts", 90);
  const unique =
    await database()`SELECT external_id FROM transit_trip WHERE source_id='renfe' AND stops_unique`;
  return {
    updates: z.array(update).safeParse(trips?.payload.updates).data ?? [],
    alerts: z.array(alert).safeParse(alerts?.payload.alerts).data ?? [],
    uniqueTrips: new Set<string>(unique.map((row) => row.external_id)),
    now,
    provenance: rows.map((row) => ({
      source: row.job_id,
      observedAt: new Date(row.observed_at).toISOString(),
      ingestedAt: new Date(row.ingested_at).toISOString(),
      status: get(row.job_id, row.job_id === "renfe-trips" ? 40 : 90)
        ? "fresh"
        : "stale_or_version_mismatch",
    })),
  };
}
export async function enrichRouting<
  T extends {
    legs: RoutingLeg[];
    start: string;
    end: string;
    duration: number;
  },
>(routes: T[], version: string, now: string, earliest: string = now) {
  const evidence = await routingEvidence(version, now);
  const filtered: { reason: string }[] = [];
  const itineraries = routes
    .flatMap((route) => {
      const result = applyRoutingEvidence(route.legs, evidence);
      if (
        result.legs[0] &&
        Date.parse(result.legs[0].effectiveStart) < Date.parse(earliest)
      )
        result.rejected = "departure_before_requested_time";
      if (result.rejected) {
        filtered.push({ reason: result.rejected });
        return [];
      }
      const start = result.legs[0]?.effectiveStart ?? route.start,
        end = result.legs.at(-1)?.effectiveEnd ?? route.end;
      return [
        {
          ...route,
          legs: result.legs,
          scheduledStart: route.start,
          scheduledEnd: route.end,
          start,
          end,
          duration: (Date.parse(end) - Date.parse(start)) / 1000,
          realtimeApplied: result.realtimeApplied,
        },
      ];
    })
    .sort((a, b) => Date.parse(a.end) - Date.parse(b.end));
  return { itineraries, filtered, provenance: evidence.provenance };
}
