import { expect, it } from "vitest";
import {
  applyRoutingEvidence,
  type RoutingLeg,
  type RoutingUpdate,
  routingObservationFresh,
} from "./routing-realtime";

const now = "2026-09-25T08:00:00Z";
const leg: RoutingLeg = {
  mode: "RAIL",
  from: { name: "A", stop: { gtfsId: "renfe:a" } },
  to: { name: "B", stop: { gtfsId: "renfe:b" } },
  start: { scheduledTime: "2026-09-25T08:05:00Z" },
  end: { scheduledTime: "2026-09-25T08:15:00Z" },
  serviceDate: "2026-09-25",
  trip: { gtfsId: "renfe:t" },
  route: { gtfsId: "renfe:r", shortName: "C5" },
};
const update: RoutingUpdate = {
  trip: { tripId: "t", startDate: "20260925" },
  observedAt: now,
  stopTimeUpdate: [
    { stopId: "a", departure: { delay: 120 } },
    { stopId: "b", arrival: { delay: 180 } },
  ],
};
const evidence = {
  updates: [update],
  alerts: [],
  uniqueTrips: new Set(["t"]),
  now,
};
it("applies matched endpoint delays preserving scheduled baseline", () => {
  const result = applyRoutingEvidence([leg], evidence);
  expect(result).toMatchObject({
    realtimeApplied: true,
    rejected: null,
    legs: [
      {
        effectiveStart: "2026-09-25T08:07:00.000Z",
        effectiveEnd: "2026-09-25T08:18:00.000Z",
        start: leg.start,
        realtimeStatus: "estimated",
      },
    ],
  });
});
it.each(["CANCELED", "SKIPPED"])(
  "excludes cancelled or skipped service %s",
  (kind) => {
    const u = structuredClone(update);
    if (kind === "CANCELED") u.trip.scheduleRelationship = kind;
    else if (u.stopTimeUpdate?.[0])
      u.stopTimeUpdate[0].scheduleRelationship = kind;
    expect(
      applyRoutingEvidence([leg], { ...evidence, updates: [u] }).rejected,
    ).toBe(kind === "CANCELED" ? "trip_cancelled" : "stop_skipped");
  },
);
it("does not match yesterday, stale, missing date, duplicate updates or circular stop evidence", () => {
  for (const updates of [
    [{ ...update, trip: { tripId: "t", startDate: "20260924" } }],
    [{ ...update, observedAt: "2026-09-25T07:59:19Z" }],
    [{ ...update, trip: { tripId: "t" } }],
    [update, update],
  ])
    expect(
      applyRoutingEvidence([leg], { ...evidence, updates }).realtimeApplied,
    ).toBe(false);
  expect(
    applyRoutingEvidence([leg], { ...evidence, uniqueTrips: new Set() })
      .realtimeApplied,
  ).toBe(false);
  const duplicated = {
    ...update,
    stopTimeUpdate: [
      ...(update.stopTimeUpdate ?? []),
      ...(update.stopTimeUpdate ?? []),
    ],
  };
  expect(
    applyRoutingEvidence([leg], { ...evidence, updates: [duplicated] })
      .realtimeApplied,
  ).toBe(false);
});
it("does not attach estimates to NO_DATA endpoints", () => {
  const u = {
    ...update,
    stopTimeUpdate: update.stopTimeUpdate?.map((s) => ({
      ...s,
      scheduleRelationship: "NO_DATA",
    })),
  };
  expect(
    applyRoutingEvidence([leg], { ...evidence, updates: [u] }).realtimeApplied,
  ).toBe(false);
});
it("propagates transfer walking duration and rejects a missed connection", () => {
  const walk: RoutingLeg = {
    ...leg,
    mode: "WALK",
    trip: null,
    route: null,
    start: { scheduledTime: "2026-09-25T08:15:00Z" },
    end: { scheduledTime: "2026-09-25T08:17:00Z" },
  };
  const next: RoutingLeg = {
    ...leg,
    trip: { gtfsId: "emt:bus" },
    start: { scheduledTime: "2026-09-25T08:20:00Z" },
    end: { scheduledTime: "2026-09-25T08:30:00Z" },
  };
  const result = applyRoutingEvidence([leg, walk, next], evidence);
  expect(result.legs[1]?.effectiveEnd).toBe("2026-09-25T08:20:00.000Z");
  expect(result.rejected).toBe(null);
  expect(
    applyRoutingEvidence(
      [
        leg,
        walk,
        { ...next, start: { scheduledTime: "2026-09-25T08:19:00Z" } },
      ],
      evidence,
    ).rejected,
  ).toBe("missed_connection");
});
it("applies only active scoped alerts; future, other-stop and unscoped alerts do not cancel", () => {
  const alert = {
    id: "a",
    title: "No service",
    effect: "NO_SERVICE",
    activePeriods: [{ start: Date.parse(now) / 1000 }],
    selectors: [{ routeId: "r" }],
  };
  expect(
    applyRoutingEvidence([leg], { ...evidence, alerts: [alert] }).rejected,
  ).toBe("service_alert");
  for (const item of [
    { ...alert, selectors: undefined },
    { ...alert, selectors: [{ routeId: "r", stopId: "other" }] },
    {
      ...alert,
      activePeriods: [{ start: Date.parse("2026-09-26T00:00:00Z") / 1000 }],
    },
  ])
    expect(
      applyRoutingEvidence([leg], { ...evidence, alerts: [item] }).rejected,
    ).toBe(null);
});
it("rejects invalid and far-future observations", () => {
  expect(routingObservationFresh("invalid", now, 40)).toBe(false);
  expect(routingObservationFresh("2026-09-25T08:00:31Z", now, 40)).toBe(false);
});
