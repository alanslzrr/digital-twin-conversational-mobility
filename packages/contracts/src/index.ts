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
  modes: z.array(z.enum(["TRANSIT", "WALK", "BIKE", "CAR"])).min(1),
  preferences: z.object({
    maxWalkingMinutes: z.number().int().min(0).max(120).default(15),
    maxTransfers: z.number().int().min(0).max(6).default(2),
    wheelchair: z.boolean().default(false),
  }),
});
export type JourneyRequest = z.infer<typeof journeyRequestSchema>;

export const resolvePlaceInputSchema = z.object({
  query: z.string().trim().min(2).max(120),
  limit: z.number().int().min(1).max(10).default(5),
});
export const departuresInputSchema = z.object({
  placeId: z.uuid(),
  limit: z.number().int().min(1).max(20).default(10),
});
export const incidentsInputSchema = z.object({
  line: z.string().trim().max(20).optional(),
  limit: z.number().int().min(1).max(30).default(10),
});
export const bikesInputSchema = z.object({
  placeId: z.uuid().optional(),
  query: z.string().trim().min(2).max(120).optional(),
  limit: z.number().int().min(1).max(20).default(5),
});
export const environmentInputSchema = z.object({
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
export const historyInputSchema = z.object({
  source: z.enum([
    "aemet",
    "renfe",
    "bicimad",
    "madrid-air",
    "madrid-traffic",
    "madrid-parking",
  ]),
  at: z.iso.datetime({ offset: true }),
});
