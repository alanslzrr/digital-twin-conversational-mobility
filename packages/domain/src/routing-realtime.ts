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
  },
) {
  let rejected: string | null = null;
  let cursor: number | null = null;
  const enriched = legs.map((leg) => {
    const scheduledStart = Date.parse(leg.start.scheduledTime),
      scheduledEnd = Date.parse(leg.end.scheduledTime);
    let start = scheduledStart,
      end = scheduledEnd;
    let realtimeStatus = leg.trip ? "no_matching_update" : "not_applicable";
    let observedAt: string | null = null;
    const id = leg.trip?.gtfsId.startsWith("renfe:")
      ? leg.trip.gtfsId.slice(6)
      : null;
    const matching = id
      ? evidence.updates.filter(
          (update) =>
            update.trip.tripId === id &&
            !!leg.serviceDate &&
            update.trip.startDate === leg.serviceDate.replaceAll("-", "") &&
            routingObservationFresh(update.observedAt, evidence.now, 40),
        )
      : [];
    const update = matching.length === 1 ? matching[0] : undefined;
    if (update) {
      observedAt = update.observedAt;
      if (update.trip.scheduleRelationship === "CANCELED")
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
        const estimate = (
          stop: typeof board,
          event: "departure" | "arrival",
          scheduled: number,
        ) => {
          if (!stop || stop.scheduleRelationship === "NO_DATA") return null;
          const value = stop[event];
          if (value?.time !== undefined && Number.isFinite(value.time))
            return value.time * 1000;
          if (value?.delay !== undefined && Number.isFinite(value.delay))
            return scheduled + value.delay * 1000;
          return null;
        };
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
            (alert.activePeriods.length === 0 ||
              alert.activePeriods.some(
                (period) =>
                  (period.start === undefined || period.start * 1000 <= end) &&
                  (period.end === undefined || period.end * 1000 > start),
              )) &&
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
