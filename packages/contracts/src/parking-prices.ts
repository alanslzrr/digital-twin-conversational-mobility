import { z } from "zod";

// Monetary rates use integer 1/10,000 EUR; totals and examples use cents.
export const parkingTariffSchema = z.object({
  id: z.string().min(1),
  vehicleType: z.literal("car"),
  currency: z.literal("EUR"),
  vatIncluded: z.boolean().nullable(),
  vatPercent: z.number().nonnegative().nullable(),
  source: z.url(),
  checkedAt: z.iso.date(),
  effectiveFrom: z.iso.date().nullable(),
  referenceYear: z.number().int(),
  referenceYearBasis: z.enum(["published_effective_date", "checked_year"]),
  bands: z.array(
    z.object({
      fromMinute: z.number().int().min(1),
      toMinute: z.number().int().max(1440),
      rateUnitsPerMinute: z.number().int().nonnegative(),
    }),
  ),
  flatBand: z
    .object({
      fromMinute: z.number().int().min(1),
      toMinute: z.number().int().max(1440),
      amountCents: z.number().int().nonnegative(),
    })
    .optional(),
  maximum: z.object({
    durationMinutes: z.literal(1440),
    amountCents: z.number().int().nonnegative(),
  }),
  examples: z.array(
    z.object({
      durationMinutes: z.number().int().min(1).max(1440),
      amountCents: z.number().int().nonnegative(),
    }),
  ),
  conditions: z.array(z.string()),
  parkAndRide: z
    .object({
      minimumMinutes: z.literal(300),
      maximumMinutes: z.literal(960),
      source: z.url(),
      conditions: z.array(z.string()),
    })
    .optional(),
});
export type ParkingTariff = z.infer<typeof parkingTariffSchema>;
