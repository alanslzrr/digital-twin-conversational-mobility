import { gtfsServiceEpoch, madridDate } from "./crtm";
import { sameServiceTrip } from "./realtime";

export type RoutingLeg = {
  mode: string;
  from: { name: string; stop?: { gtfsId: string } | null | undefined };
  to: { name: string; stop?: { gtfsId: string } | null | undefined };
  start: { scheduledTime: string };
  end: { scheduledTime: string };
  route: { gtfsId: string; shortName: string | null } | null;
  trip: { gtfsId: string } | null;
  serviceDate?: string | null | undefined;
};
export type RoutingUpdate = {
  delay?: number | undefined;
  trip: {
    tripId: string;
    startDate?: string | undefined;
    scheduleRelationship?: string | undefined;
  };
  observedAt: string;
  stopTimeUpdate?:
    | {
        stopId: string;
        scheduleRelationship?: string | undefined;
        arrival?:
          | { time?: number | undefined; delay?: number | undefined }
          | undefined;
        departure?:
          | { time?: number | undefined; delay?: number | undefined }
          | undefined;
      }[]
    | undefined;
};
export type RoutingAlert = {
  id: string;
  title: string;
  effect: string;
  activePeriods: { start?: number | undefined; end?: number | undefined }[];
  selectors?:
    | {
        routeId?: string | undefined;
        stopId?: string | undefined;
        trip?: { tripId: string; startDate?: string | undefined } | undefined;
      }[]
    | undefined;
};
export function routingObservationFresh(
  observedAt: string,
  now: string,
  maxAge: number,
) {
  const age = Date.parse(now) - Date.parse(observedAt);
  return Number.isFinite(age) && age >= -30_000 && age <= maxAge * 1000;
}
export function applyRoutingEvidence(
  legs: RoutingLeg[],
  evidence: {
    updates: RoutingUpdate[];
    alerts: RoutingAlert[];
    uniqueTrips: Set<string>;
    now: string;
    earliest?: string | undefined;
  },
) {
  let rejected: string | null = null;
  let cursor: number | null = evidence.earliest
    ? Date.parse(evidence.earliest)
    : null;
  const enriched = legs.map((leg) => {
    const scheduledStart = Date.parse(leg.start.scheduledTime),
      scheduledEnd = Date.parse(leg.end.scheduledTime);
    let start = scheduledStart,
      end = scheduledEnd;
    let realtimeStatus = leg.trip ? "no_matching_update" : "not_applicable";
    let observedAt: string | null = null;
    let estimateBasis: string | null = null;
    const id = leg.trip?.gtfsId.startsWith("renfe:")
      ? leg.trip.gtfsId.slice(6)
      : null;
    const matching = id
      ? evidence.updates.filter(
          (update) =>
            update.trip.tripId === id &&
            (!update.trip.scheduleRelationship ||
              ["SCHEDULED", "CANCELED", "DELETED"].includes(
                update.trip.scheduleRelationship,
              )) &&
            !!leg.serviceDate &&
            sameServiceTrip(
              { ...update.trip, observedAt: update.observedAt },
              id,
              gtfsServiceEpoch(leg.serviceDate) / 1000,
            ) &&
            (update.trip.startDate !== undefined ||
              (madridDate(new Date(scheduledStart)) === leg.serviceDate &&
                Math.abs(scheduledStart - Date.parse(update.observedAt)) <=
                  2 * 60 * 60 * 1000)) &&
            routingObservationFresh(update.observedAt, evidence.now, 40),
        )
      : [];
    const update = matching.length === 1 ? matching[0] : undefined;
    if (update) {
      observedAt = update.observedAt;
      if (
        ["CANCELED", "DELETED"].includes(update.trip.scheduleRelationship ?? "")
      )
        rejected = "trip_cancelled";
      realtimeStatus = "unmatched_stop_identity";
      if (id && evidence.uniqueTrips.has(id)) {
        const at = (stop: string | undefined) => {
          const found =
            update.stopTimeUpdate?.filter(
              (x) => `renfe:${x.stopId}` === stop,
            ) ?? [];
          return found.length === 1 ? found[0] : undefined;
        };
        const board = at(leg.from.stop?.gtfsId),
          alight = at(leg.to.stop?.gtfsId);
        if (
          board?.scheduleRelationship === "SKIPPED" ||
          alight?.scheduleRelationship === "SKIPPED"
        )
          rejected = "stop_skipped";
        // Trip delay is usable without a full stop sequence only when every
        // supplied stop agrees. A conflicting override/NO_DATA disables it.
        const updates = update.stopTimeUpdate ?? [];
        const globalDelay =
          typeof update.delay === "number" &&
          Number.isFinite(update.delay) &&
          Math.abs(update.delay) <= 7200 &&
          new Set(updates.map((s) => s.stopId)).size === updates.length &&
          updates.every(
            (s) =>
              (!s.scheduleRelationship ||
                s.scheduleRelationship === "SCHEDULED") &&
              [s.arrival, s.departure].every(
                (e) => !e || e.delay === update.delay,
              ),
          )
            ? update.delay
            : null;
        const estimate = (
          stop: typeof board,
          event: "departure" | "arrival",
          scheduled: number,
        ) => {
          if (
            stop?.scheduleRelationship &&
            stop.scheduleRelationship !== "SCHEDULED"
          )
            return null;
          const value = stop?.[event];
          if (value?.time !== undefined && Number.isFinite(value.time))
            return value.time * 1000;
          if (value?.delay !== undefined && Number.isFinite(value.delay))
            return scheduled + value.delay * 1000;
          return globalDelay === null ? null : scheduled + globalDelay * 1000;
        };
        estimateBasis =
          globalDelay === null
            ? "endpoint_update"
            : "consistent_trip_delay_with_endpoint_precedence";
        const departure = estimate(board, "departure", start),
          arrival = estimate(alight, "arrival", end);
        if (departure !== null) start = departure;
        if (arrival !== null) end = arrival;
        realtimeStatus =
          departure !== null && arrival !== null
            ? "estimated"
            : departure !== null || arrival !== null
              ? "partially_estimated"
              : "no_stop_estimate";
      }
    }
    const alerts = id
      ? evidence.alerts.filter(
          (alert) =>
            alert.activePeriods.some(
              (period) =>
                (period.start !== undefined || period.end !== undefined) &&
                (period.start === undefined || period.start * 1000 <= end) &&
                (period.end === undefined || period.end * 1000 > start),
            ) &&
            alert.selectors?.some(
              (selector) =>
                (!selector.routeId ||
                  `renfe:${selector.routeId}` === leg.route?.gtfsId) &&
                (!selector.trip ||
                  (selector.trip.tripId === id &&
                    (!selector.trip.startDate ||
                      selector.trip.startDate ===
                        leg.serviceDate?.replaceAll("-", "")))) &&
                (!selector.stopId ||
                  [leg.from.stop?.gtfsId, leg.to.stop?.gtfsId].includes(
                    `renfe:${selector.stopId}`,
                  )) &&
                !!(selector.routeId || selector.trip || selector.stopId),
            ),
        )
      : [];
    if (alerts.some((alert) => alert.effect === "NO_SERVICE"))
      rejected = "service_alert";
    if (!leg.trip && cursor !== null) {
      // Preserve actual walking duration when preceding transit is delayed.
      start = Math.max(start, cursor);
      end = start + (scheduledEnd - scheduledStart);
    } else if (cursor !== null && start < cursor)
      rejected = "missed_connection";
    if (end < start) rejected = "inconsistent_estimate";
    cursor = end;
    return {
      ...leg,
      effectiveStart: new Date(start).toISOString(),
      effectiveEnd: new Date(end).toISOString(),
      realtimeStatus,
      observedAt,
      estimateBasis,
      serviceDateMatch: update
        ? update.trip.startDate
          ? "explicit"
          : "observation_day_nearby_schedule"
        : null,
      alerts: alerts.map(({ id, title, effect }) => ({ id, title, effect })),
    };
  });
  return {
    legs: enriched,
    rejected: rejected as string | null,
    realtimeApplied: enriched.some((leg) =>
      ["estimated", "partially_estimated"].includes(leg.realtimeStatus),
    ),
  };
}

export type RoutingLineAlert = {
  id: string;
  title: string;
  lines: string[];
  startsAt: string | null;
  endsAt: string | null;
  effect: string | null;
};
// EMT's published line labels are case-insensitive, but leading zeroes carry
// meaning (e.g. 001 != 1). A line-level notice does not identify a cancelled trip.
export function matchingEmtRoutingAlerts(
  leg: RoutingLeg,
  alerts: RoutingLineAlert[],
) {
  if (!leg.route?.gtfsId.startsWith("emt:") || !leg.route.shortName) return [];
  const label = leg.route.shortName.trim().toUpperCase();
  return alerts
    .filter(
      (alert) =>
        alert.lines.some((line) => line.trim().toUpperCase() === label) &&
        alert.startsAt &&
        alert.endsAt &&
        Date.parse(alert.startsAt) < Date.parse(alert.endsAt) &&
        Date.parse(alert.startsAt) <= Date.parse(leg.end.scheduledTime) &&
        Date.parse(alert.endsAt) > Date.parse(leg.start.scheduledTime),
    )
    .map((alert) => ({
      ...alert,
      source: "emt",
      impactApplied: false,
      scope: "published_line_notice",
      warning:
        "El aviso puede afectar al trayecto; no se ha reconstruido el desvío ni demostrado la cancelación del viaje.",
    }));
}
