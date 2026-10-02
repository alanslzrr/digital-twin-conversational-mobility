import { z } from "zod";

export const dashboardScopes = {
  read: "mobility.dashboard.read",
  execute: "mobility.dashboard.execute",
  activity: "mobility.dashboard.activity",
  telemetry: "mobility.telemetry.write",
} as const;

export const dashboardLimits = {
  listBytes: 256 * 1024,
  mapBytes: 1024 * 1024,
  inputBytes: 8192,
  executionOutputBytes: 256000,
  executionDeadlineMs: 60000,
  executionLeaseMs: 70000,
  sessionBytes: 16 * 1024 * 1024,
  evaluatorBytes: 256 * 1024 * 1024,
  sessionEvents: 10000,
  batchBytes: 1024 * 1024,
  batchEvents: 32,
  sinkDeadlineMs: 200,
  retentionDays: 7,
} as const;

export const dashboardToolName = z.enum([
  "resolve_place",
  "resolve_address",
  "plan_journey",
  "get_departures",
  "get_emt_arrivals",
  "get_crtm_timetable",
  "get_incidents",
  "get_bike_availability",
  "get_environment",
  "get_road_state",
  "get_parking",
  "get_historical_state",
  "get_source_health",
  "get_line_status",
  "get_network_status",
  "get_mobility_snapshot",
]);
export type DashboardToolName = z.infer<typeof dashboardToolName>;

export const dashboardCategory = z.enum([
  "places",
  "departures",
  "incidents",
  "bikes",
  "environment",
  "traffic",
  "parking",
]);
export const dashboardFreshness = z.enum([
  "recent",
  "recently_checked",
  "stale",
  "unavailable",
  "static",
  "unknown",
]);
const publicId = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_.:-]+$/);
const timestamp = z.iso.datetime({ offset: true });
const envelope = { schemaVersion: z.literal(1), readAt: timestamp };

export const dashboardEntityQuery = z.strictObject({
  category: dashboardCategory,
  source: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  freshness: dashboardFreshness.optional(),
  search: z.string().trim().max(100).optional(),
  cursor: z.string().min(1).max(4096).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const dashboardMapQuery = dashboardEntityQuery
  .omit({ cursor: true, limit: true })
  .extend({
    bbox: z
      .tuple([
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
      ])
      .refine(
        ([west, south, east, north]) => west < east && south < north,
        "Invalid bounding box",
      ),
  });
export const dashboardEventQuery = z
  .strictObject({
    from: timestamp,
    to: timestamp,
    source: publicId.optional(),
    type: publicId.optional(),
    severity: z.enum(["info", "warning", "error"]).optional(),
    cursor: z.string().min(1).max(4096).optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .refine(({ from, to }) => {
    const range = Date.parse(to) - Date.parse(from);
    return range >= 0 && range <= dashboardLimits.retentionDays * 86400000;
  }, "Event range must be at most seven days");

export const dashboardEvidence = z.strictObject({
  sourceId: publicId,
  productId: publicId,
  version: z.string().max(200).nullable(),
  observedAt: timestamp.nullable(),
  ingestedAt: timestamp.nullable(),
  checkedAt: timestamp.nullable(),
  issuedAt: timestamp.nullable(),
  issuedAtRaw: z.string().max(100).nullable(),
  validFrom: timestamp.nullable(),
  validTo: timestamp.nullable(),
  freshness: dashboardFreshness,
  freshnessBase: timestamp.nullable(),
  ageSeconds: z.number().nonnegative().nullable(),
  thresholdSeconds: z.number().nonnegative().nullable(),
  reason: publicId.nullable(),
  quality: z.enum(["validated", "provisional", "unknown"]),
  coverage: z.enum(["complete", "partial", "unknown", "unavailable"]),
});
export const dashboardMeasurement = z.strictObject({
  name: z.string().min(1).max(100),
  value: z
    .union([z.string().max(2000), z.number().finite(), z.boolean()])
    .nullable(),
  unit: z.string().max(40).nullable(),
});
export const dashboardEntity = z.strictObject({
  id: publicId,
  category: dashboardCategory,
  name: z.string().min(1).max(300),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  evidence: dashboardEvidence,
  measurements: z.array(dashboardMeasurement).max(64),
  truncated: z.boolean(),
});
export const dashboardEntityPage = z.strictObject({
  ...envelope,
  entities: z.array(dashboardEntity).max(100),
  nextCursor: z.string().max(4096).nullable(),
  revisions: z.record(publicId, z.string().max(200)),
  limited: z.boolean(),
  countScope: z.literal("returned_page"),
});
export const dashboardMapPage = z.strictObject({
  ...envelope,
  entities: z.array(dashboardEntity).max(1000),
  revisions: z.record(publicId, z.string().max(200)),
  limited: z.boolean(),
  countScope: z.literal("returned_viewport"),
});
export const dashboardInspectInput = z.strictObject({
  tool: dashboardToolName,
  // The registry applies the actual tool schema before invoking any executor.
  input: z.record(z.string().max(100), z.unknown()),
});
export const dashboardExecutionInput = dashboardInspectInput.extend({
  requestId: z.uuid(),
  confirmEffects: z.literal(true),
});
export const dashboardActivityInput = z.strictObject({});
export const dashboardExecutionState = z.enum([
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "outcome_unknown",
]);
export type DashboardEntity = z.infer<typeof dashboardEntity>;
export type DashboardEvidence = z.infer<typeof dashboardEvidence>;

export const dashboardToolEffect = z.enum([
  "activate_window",
  "acquire_provider",
  "demand_weather",
  "write_cache",
  "calculate_otp",
]);
export const dashboardToolDescriptor = z.strictObject({
  name: dashboardToolName,
  title: z.string().max(300),
  description: z.string().max(8192),
  inputSchemaJson: z.string().max(32000),
  requiredScope: z.literal("mobility.read"),
  possibleEffects: z.array(dashboardToolEffect).max(5),
  storedAvailability: z.enum(["selector", "not_materialized"]),
});
export const dashboardToolCatalog = z.strictObject({
  ...envelope,
  tools: z.array(dashboardToolDescriptor).length(16),
});
export type DashboardToolEffect = z.infer<typeof dashboardToolEffect>;

export const dashboardStatus = z.strictObject({
  ...envelope,
  ingestionEnabled: z.boolean(),
  activeUntil: timestamp.nullable(),
  workers: z
    .array(
      z.strictObject({
        id: z.string().max(40),
        lastSeenAt: timestamp.nullable(),
        lastPrunedAt: timestamp.nullable(),
        state: z.enum([
          "disabled",
          "not_seen",
          "stopped_or_unreachable",
          "running",
          "inactive_window",
        ]),
      }),
    )
    .max(2),
  revisions: z.record(publicId, z.string().max(200)),
  captureVersion: z.number().int().positive().nullable(),
  captureCoverage: z.enum(["not_instrumented", "best_effort", "partial"]),
});
export const dashboardActivity = z.strictObject({
  ...envelope,
  enabled: z.boolean(),
  activeUntil: timestamp.nullable(),
});

export const dashboardData = z.strictObject({
  schemaVersion: z.literal(1),
  readAt: timestamp,
  data: z.json(),
  truncated: z.boolean(),
  nextCursor: z.string().max(4096).nullable(),
});
