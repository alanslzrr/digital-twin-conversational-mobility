import { z } from "zod";

const time = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();
export const dashboardWindow = z.enum(["1h", "24h", "7d"]);
export const dashboardMetric = z.strictObject({
  id: z.string().regex(/^M(?:[1-9]|1[0-3])$/),
  label: z.string().max(120),
  value: z.number().finite().nullable(),
  unit: z.string().max(100),
  definition: z.string().max(1000),
  excludes: z.string().max(1000),
  coverage: z.string().max(500),
  missingReason: z.string().max(300).nullable(),
  detailHref: z.string().startsWith("/dashboard").max(1000),
  evaluatedAt: time,
  period: z.strictObject({ from: time.nullable(), to: time }),
  selection: z.string().max(500),
  denominator: z.strictObject({
    included: count.nullable(),
    observed: count.nullable(),
    unit: z.string().max(100),
  }),
  provenance: z.string().max(500),
});
export const dashboardActivityChart = z.strictObject({
  from: time,
  to: time,
  firstRetainedEventAt: time.nullable(),
  lastRetainedEventAt: time.nullable(),
  publications: count.nullable(),
  errors: count.nullable(),
  total: count.nullable(),
  coverage: z.literal("best_effort"),
  bins: z
    .array(
      z.strictObject({
        from: time,
        to: time,
        publications: count.nullable(),
        errors: count.nullable(),
      }),
    )
    .max(28),
});
export const dashboardProductSummary = z.strictObject({
  id: z.string().max(80),
  label: z.string().max(120),
  source: z.string().max(40),
  category: z.enum([
    "departures",
    "incidents",
    "bikes",
    "environment",
    "traffic",
    "parking",
  ]),
  mode: z.enum(["periodic", "demand"]),
  enabled: z.boolean(),
  usable: z.boolean(),
  total: count.nullable(),
  recent: count.nullable(),
  stale: count.nullable(),
  unavailable: count.nullable(),
  unit: z.string().max(100),
  observedAt: time.nullable(),
  ingestedAt: time.nullable(),
  issue: z.string().max(300).nullable(),
});
export const dashboardOverview = z.strictObject({
  schemaVersion: z.literal(1),
  readAt: time,
  evaluatedAt: time,
  metrics: z.array(dashboardMetric).length(4),
  products: z.array(dashboardProductSummary).max(16),
  attention: z
    .array(
      z.strictObject({
        label: z.string().max(300),
        href: z.string().startsWith("/dashboard").max(1000),
      }),
    )
    .max(3),
  activity: dashboardActivityChart,
  recentEvents: z
    .array(
      z.strictObject({
        id: z.string().regex(/^\d+$/),
        type: z.enum([
          "publication",
          "refresh",
          "lease_lost",
          "lease_recovered",
          "release",
        ]),
        outcome: z.enum([
          "success",
          "historical_only",
          "error",
          "lease_lost",
          "storage_error",
        ]),
        source: z.string().max(40),
        occurredAt: time,
      }),
    )
    .max(5),
  parkingCategory: z.string().max(80).nullable(),
  parkingCategories: z
    .array(
      z.strictObject({ code: z.string().max(80), label: z.string().max(120) }),
    )
    .max(100),
});
export type DashboardMetric = z.infer<typeof dashboardMetric>;
export type DashboardActivityChart = z.infer<typeof dashboardActivityChart>;
export type DashboardOverview = z.infer<typeof dashboardOverview>;
export const dashboardEntitySeries = z.strictObject({
  schemaVersion: z.literal(1),
  readAt: time,
  from: time,
  to: time,
  product: z.string().max(80),
  entityId: z.string().max(160),
  magnitude: z.string().max(80),
  unit: z.string().max(40),
  mode: z.literal("event"),
  gapSeconds: count,
  points: z
    .array(
      z.strictObject({
        observedAt: time,
        ingestedAt: time,
        revisionId: z.string().max(80),
        value: z.number().finite(),
      }),
    )
    .max(240),
  reduced: z.boolean(),
  coverage: z.literal("partial"),
  warning: z.string().max(1000),
});
export type DashboardEntitySeries = z.infer<typeof dashboardEntitySeries>;

export const dashboardEventType = z.enum([
  "publication",
  "refresh",
  "lease_lost",
  "lease_recovered",
  "release",
]);
export const dashboardEventOutcome = z.enum([
  "success",
  "historical_only",
  "error",
  "lease_lost",
  "storage_error",
]);
export const dashboardOperationalEvent = z.strictObject({
  id: z.string().regex(/^\d+$/),
  type: dashboardEventType,
  component: z.enum(["ingestion", "weather", "emt", "geocoder", "routing"]),
  severity: z.enum(["info", "warning", "error"]),
  source: z.string().max(40),
  job: z.string().max(80),
  operationId: z.string().max(160),
  outcome: dashboardEventOutcome,
  errorCode: z.string().max(100).nullable(),
  errorStage: z.string().max(80).nullable(),
  durationMs: z.number().finite().nonnegative().nullable(),
  occurredAt: time,
  recordedAt: time.nullable(),
  expiresAt: time.nullable(),
});
export const dashboardEventPage = z.strictObject({
  events: z.array(dashboardOperationalEvent).max(100),
  range: z.strictObject({ from: time, to: time }),
  activity: dashboardActivityChart,
  nextCursor: z.string().max(4096).nullable(),
  coverage: z.literal("best_effort"),
  warning: z.string().max(1000),
});
export type DashboardOperationalEvent = z.infer<
  typeof dashboardOperationalEvent
>;
