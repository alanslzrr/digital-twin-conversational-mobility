import { z } from "zod";
import { epoch, id, numeric, timestamp } from "./common";

const trip = z.object({
  tripId: id,
  startDate: z.string().optional(),
  scheduleRelationship: z.string().optional(),
});
const event = z.object({ delay: numeric.optional(), time: epoch.optional() });
const translation = z.object({
  translation: z
    .array(
      z.object({
        text: z.string().max(12000),
        language: z.string().optional(),
      }),
    )
    .max(20),
});
const feed = z.object({
  header: z.object({
    timestamp: epoch,
    incrementality: z.enum(["FULL_DATASET"]).optional(),
  }),
  entity: z
    .array(
      z.object({
        id,
        isDeleted: z.literal(false).optional(),
        tripUpdate: z
          .object({
            trip,
            timestamp: epoch.optional(),
            delay: numeric.optional(),
            stopTimeUpdate: z
              .array(
                z.object({
                  stopId: id,
                  stopSequence: numeric.optional(),
                  arrival: event.optional(),
                  departure: event.optional(),
                  scheduleRelationship: z.string().optional(),
                }),
              )
              .optional(),
          })
          .optional(),
        alert: z
          .object({
            activePeriod: z
              .array(
                z.object({ start: epoch.optional(), end: epoch.optional() }),
              )
              .optional(),
            informedEntity: z
              .array(
                z.object({
                  routeId: id.optional(),
                  stopId: id.optional(),
                  trip: trip.optional(),
                }),
              )
              .optional(),
            headerText: translation.optional(),
            descriptionText: translation.optional(),
            cause: z.string().optional(),
            effect: z.string().optional(),
          })
          .optional(),
      }),
    )
    .max(30000),
});

export function parseRenfe(input: unknown, now = Date.now()) {
  const data = feed.parse(input);
  return {
    observedAt: timestamp(data.header.timestamp, now),
    entities: data.entity,
  };
}

export function spanishText(value: z.infer<typeof translation> | undefined) {
  return (
    (
      value?.translation.find((text) => text.language === "es") ??
      value?.translation[0]
    )?.text ?? ""
  );
}
