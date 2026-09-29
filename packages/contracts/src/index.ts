import { z } from "zod";

export const sourceIdSchema = z.enum([
  "renfe",
  "emt",
  "bicimad",
  "crtm",
  "aemet",
  "dgt",
  "madrid-air",
  "madrid-traffic",
  "madrid-parking",
  "osm",
]);
export type SourceId = z.infer<typeof sourceIdSchema>;

export const provenanceSchema = z.object({
  source: sourceIdSchema,
  observedAt: z.iso.datetime({ offset: true }),
  ingestedAt: z.iso.datetime({ offset: true }),
  quality: z.enum(["validated", "provisional", "unknown"]),
  staticVersion: z.string().optional(),
  rawReference: z.string().optional(),
});
export type Provenance = z.infer<typeof provenanceSchema>;

export const sourceHealthInputSchema = z.object({
  source: sourceIdSchema.optional(),
});

export const canonicalPlaceSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  kind: z.enum([
    "station",
    "stop",
    "interchange",
    "entrance",
    "bike_station",
    "parking",
    "address",
  ]),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type CanonicalPlace = z.infer<typeof canonicalPlaceSchema>;

export const journeyRequestSchema = z.object({
  originId: z.uuid(),
  destinationId: z.uuid(),
  departureTime: z.union([z.literal("now"), z.iso.datetime({ offset: true })]),
  modes: z
    .array(z.enum(["TRANSIT", "WALK", "BIKE", "CAR"]))
    .min(1)
    .describe(
      "TRANSIT requires a transit leg and allows walking access/egress/transfers within maxWalkingMinutes. WALK allows entirely walking routes. TRANSIT+WALK allows either. BIKE/CAR are currently unsupported.",
    ),
  preferences: z.object({
    maxWalkingMinutes: z.number().int().min(0).max(120).default(15),
    maxTransfers: z.number().int().min(0).max(6).default(2),
    wheelchair: z.boolean().default(false),
  }),
});
export type JourneyRequest = z.infer<typeof journeyRequestSchema>;

export const routingFailureReasonSchema = z.enum([
  "invalid_request",
  "unsupported_modes",
  "unknown_place",
  "outside_static_service_period",
  "graph_not_ready",
  "routing_update_in_progress",
  "graph_static_version_mismatch",
  "routing_not_configured",
  "routing_not_local",
  "routing_timeout",
  "routing_unavailable",
  "routing_contract_error",
  "routing_invalid_response",
  "routing_outside_coverage",
  "routing_backend_unavailable",
  "routing_internal_error",
]);
export type RoutingFailureReason = z.infer<typeof routingFailureReasonSchema>;

export const resolvePlaceInputSchema = z.object({
  query: z.string().trim().min(1).max(120),
  source: z.enum(["renfe", "emt", "bicimad", "crtm"]).optional(),
  network: z
    .enum(["metro", "light-rail", "interurban", "emt"])
    .optional()
    .describe("CRTM network filter; use with source=crtm."),
  limit: z.number().int().min(1).max(10).default(5),
});
export const departuresInputSchema = z.object({
  placeId: z.uuid(),
  limit: z.number().int().min(1).max(20).default(10),
});
export const emtArrivalsInputSchema = z.object({
  placeId: z
    .uuid()
    .describe(
      "Canonical EMT stop UUID returned by resolve_place with source=emt; not a stop number or a Renfe place.",
    ),
  limit: z.number().int().min(1).max(20).default(5),
});
export const incidentsInputSchema = z.object({
  source: z.enum(["renfe", "emt", "dgt"]).default("renfe"),
  query: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .optional()
    .describe("DGT road, province or municipality; not a transit line."),
  includeWithdrawn: z
    .boolean()
    .optional()
    .describe(
      "DGT withdrawals in the retained 24h window; not confirmed cancellations.",
    ),
  line: z.string().trim().max(20).optional(),
  limit: z.number().int().min(1).max(30).default(10),
});
export const bikesInputSchema = z.object({
  placeId: z.uuid().optional(),
  query: z.string().trim().min(2).max(120).optional(),
  limit: z.number().int().min(1).max(20).default(5),
});
export const environmentInputSchema = z.object({
  weatherProduct: z
    .enum(["observation", "hourly_forecast", "warnings"])
    .optional(),
  placeId: z.string().uuid().optional(),
  fromTime: z.iso.datetime({ offset: true }).optional(),
  toTime: z.iso.datetime({ offset: true }).optional(),
  kind: z.enum(["air", "weather"]).default("air"),
  stationId: z.string().max(30).optional(),
  pollutant: z
    .enum(["SO2", "CO", "NO", "NO2", "PM2.5", "PM10", "NOx", "O3"])
    .optional(),
  limit: z.number().int().min(1).max(30).default(10),
});
export const roadInputSchema = z.object({
  query: z.string().trim().min(2).max(120),
  limit: z.number().int().min(1).max(20).default(10),
});
export const parkingInputSchema = roadInputSchema;
export const historyInputSchema = z
  .object({
    source: z.enum([
      "dgt",
      "aemet",
      "emt",
      "renfe",
      "bicimad",
      "madrid-air",
      "madrid-traffic",
      "madrid-parking",
    ]),
    at: z.iso.datetime({ offset: true }).optional(),
    minutesAgo: z
      .number()
      .min(0)
      .max(1440)
      .optional()
      .describe(
        "Relative time in elapsed minutes, resolved using the Core server clock. Supply exactly one of at or minutesAgo.",
      ),
    mode: z
      .enum(["event", "knowledge"])
      .default("event")
      .describe(
        "event: latest retained revision of observations at/before at, possibly learned later. knowledge: only revisions ingested at/before at.",
      ),
  })
  .refine(
    (input) => (input.at !== undefined) !== (input.minutesAgo !== undefined),
    {
      message: "Supply exactly one of at or minutesAgo",
    },
  );

export const crtmTimetableInputSchema = z.object({
  placeId: z
    .uuid()
    .describe("CRTM UUID returned by resolve_place(source=crtm)."),
  serviceDate: z.iso
    .date()
    .optional()
    .describe(
      "Madrid GTFS service date; defaults to today. Not a historical knowledge query.",
    ),
  afterTime: z
    .string()
    .regex(/^(?:[0-6]\d|7[01]):[0-5]\d:[0-5]\d$/)
    .optional()
    .describe(
      "GTFS clock HH:mm:ss, allows >24h. Defaults to now for today's service date, otherwise 00:00:00. Only this service day is searched.",
    ),
  limit: z.number().int().min(1).max(20).default(10),
});

export const resolveAddressInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(3)
    .max(160)
    .regex(/^\P{Cc}+$/u),
  allowExternal: z
    .boolean()
    .default(false)
    .describe(
      "Only true when the user requests looking up this public address/place externally after privacy disclosure. Never personal/confidential data. Local catalogs are always searched first.",
    ),
});

export const lineStatusInputSchema = z.object({
  source: z.enum(["renfe", "emt", "crtm"]),
  network: z.enum(["metro", "light-rail", "interurban", "emt"]).optional(),
  line: z.string().trim().min(1).max(40),
  limit: z.number().int().min(1).max(20).default(5),
});
export const networkStatusInputSchema = z.object({
  source: z.enum(["renfe", "emt", "crtm", "dgt"]).optional(),
});
export const mobilitySnapshotInputSchema = z.object({
  source: sourceIdSchema.optional(),
});

export type {
  AccessibilityDeclaration,
  AccessibilityRef,
  AccessibilityStatus,
} from "./accessibility";
export {
  type ConversationPage,
  conversationCursor,
  conversationListAction,
  conversationPage,
} from "./conversations";
export type {
  MadridWarnings,
  MunicipalForecast,
  WeatherAlert,
  WeatherEvidence,
  WeatherPeriod,
  WeatherProduct,
} from "./journey-weather";
