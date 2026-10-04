import { z } from "zod";
import { dashboardData } from "./dashboard";
import { dashboardEventType } from "./dashboard-insights";

const time = z.iso.datetime({ offset: true }).nullable();
const count = z.number().int().nonnegative();
const code = z.string().max(160).nullable();
const catalog = z.strictObject({
  id: z.string().max(160),
  version: z.string().max(200),
  serviceStart: z.string().max(40).nullable(),
  serviceEnd: z.string().max(40).nullable(),
  importedAt: time,
  enabled: z.boolean().optional(),
});
const stream = z.strictObject({
  id: z.string().max(80),
  observedAt: time,
  ingestedAt: time,
  quality: z.enum(["validated", "provisional", "unknown"]),
  count: count.nullable(),
  countScope: z.literal("collection_only"),
  freshness: z.strictObject({
    status: z.enum(["fresh", "stale", "unavailable"]),
    ageSeconds: count.nullable(),
    reason: z
      .enum(["missing_observation", "invalid_timestamp", "future_observation"])
      .optional(),
  }),
  nextDueAt: time,
  lastAttemptAt: time,
  lastFinishedAt: time,
  leaseUntil: time,
  failures: count,
  attempts: count,
  recoveredLeases: count,
  errorCode: code,
  errorStage: code,
  state: z.enum(["running", "backoff", "scheduled"]),
});
export const dashboardSourceMetrics = z.strictObject({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  operation: dashboardEventType.nullable(),
  errors: count.nullable(),
  issueProducts: z.array(z.string().max(80)).max(16),
  monitoredProducts: count,
  issueCauses: z
    .array(
      z.strictObject({
        product: z.string().max(80),
        cause: z.enum(["recorded_error", "missing_worker_signal"]),
      }),
    )
    .max(16),
  durations: z
    .array(
      z.strictObject({
        component: z.string().max(40),
        operation: dashboardEventType,
        n: count,
        medianMs: z.number().nonnegative().nullable(),
        p95Ms: z.number().nonnegative().nullable(),
      }),
    )
    .max(25),
  coverage: z.literal("best_effort"),
  warning: z.string().max(1000),
});
export const dashboardSourceDetail = z.strictObject({
  sources: z
    .array(
      z.strictObject({
        id: z.string().max(40),
        strategy: z.enum(["continuous", "snapshot", "hybrid"]),
        enabled: z.boolean(),
        streams: z.array(stream).max(9),
        staticFeed: z.array(catalog).max(10),
        staticCatalogs: z.array(catalog).max(100),
        coverage: z.string().max(1000),
      }),
    )
    .max(10),
  components: z
    .array(
      z.strictObject({
        id: z.string().max(40),
        nextDueAt: time,
        leaseUntil: time,
        failures: count,
        errorCode: code,
        count: count.nullable(),
      }),
    )
    .max(3),
  resources: z
    .array(
      z.strictObject({
        id: z.string().max(160),
        label: z.string().max(300),
        version: z.string().max(200).nullable(),
        checkedAt: time,
        fetchedAt: time,
        issuedAt: time,
        ageBasis: time,
        validFrom: time,
        validTo: time,
        nextDueAt: time,
        failures: count,
        errorCode: code,
        leaseUntil: time,
      }),
    )
    .max(50),
  arrivals: z
    .array(
      z.strictObject({
        id: z.string().max(160),
        observedAt: time,
        ingestedAt: time,
        nextDueAt: time,
        failures: count,
        errorCode: code,
      }),
    )
    .max(50),
  routes: z
    .array(
      z.strictObject({
        id: z.string().max(160),
        state: z.string().max(40),
        activatedAt: time,
        createdAt: time,
      }),
    )
    .max(1),
  resourcePage: z.strictObject({
    kind: z.enum(["weather", "arrivals"]),
    total: count,
    returned: count.max(50),
    nextCursor: z.string().max(4096).nullable(),
    version: z.string().max(200),
  }),
  truncated: z.boolean(),
  metrics: dashboardSourceMetrics,
});
export const dashboardSourceResponse = dashboardData.extend({
  data: dashboardSourceDetail,
});
