import type { ParkingTariff } from "@mobility/contracts";
import { madridDate } from "./crtm";

export function parkingCost(tariff: ParkingTariff, durationMinutes?: number) {
  if (durationMinutes === undefined)
    return { status: "not_requested" as const };
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > 1440
  )
    throw new Error("invalid_parking_duration");
  const example = tariff.examples.find(
    (item) => item.durationMinutes === durationMinutes,
  );
  const flat = tariff.flatBand;
  let units = 0;
  let covered = 0;
  for (const band of tariff.bands) {
    const minutes = Math.max(
      0,
      Math.min(durationMinutes, band.toMinute) - band.fromMinute + 1,
    );
    units += minutes * band.rateUnitsPerMinute;
    covered += minutes;
  }
  const method = example
    ? "published_example"
    : flat &&
        durationMinutes >= flat.fromMinute &&
        durationMinutes <= flat.toMinute
      ? "published_flat_band"
      : covered === durationMinutes
        ? "calculated_bands"
        : "published_maximum_only";
  const amountCents = Math.min(
    tariff.maximum.amountCents,
    example?.amountCents ??
      (method === "published_flat_band"
        ? (flat?.amountCents ?? tariff.maximum.amountCents)
        : method === "calculated_bands"
          ? Math.round(units / 100)
          : tariff.maximum.amountCents),
  );
  return {
    status:
      method === "published_maximum_only"
        ? ("maximum_only" as const)
        : ("estimated" as const),
    durationMinutes,
    amountCents,
    amount: amountCents / 100,
    currency: tariff.currency,
    method,
    approximate: method !== "published_maximum_only",
    ...(method === "published_maximum_only"
      ? { reason: "incomplete_published_bands", maximumDurationMinutes: 1440 }
      : {}),
  };
}

export function parkingPriceContext(
  tariff: ParkingTariff,
  date: string,
  now = new Date(),
) {
  const year = Number(date.slice(0, 4));
  const projection =
    year !== tariff.referenceYear ||
    date > madridDate(now) ||
    Boolean(tariff.effectiveFrom && date < tariff.effectiveFrom);
  return {
    requestedDate: date,
    referenceYear: tariff.referenceYear,
    basis: projection
      ? "projection_at_last_published_prices"
      : "last_published_tariff",
    futurePriceConfirmed: false,
    ...(projection
      ? {
          note: `A precios conocidos de ${tariff.referenceYear}; podrían cambiar para esa fecha. No es un precio histórico reconstruido.`,
        }
      : {}),
  };
}

export function parkingFreeScenario(
  tariff: ParkingTariff,
  durationMinutes?: number,
) {
  if (!tariff.parkAndRide) return null;
  return {
    status: "conditional" as const,
    amountCents: 0,
    currency: tariff.currency,
    durationEligible:
      durationMinutes === undefined
        ? null
        : durationMinutes >= tariff.parkAndRide.minimumMinutes &&
          durationMinutes <= tariff.parkAndRide.maximumMinutes,
    ...tariff.parkAndRide,
    appliedToOrdinaryCost: false,
  };
}
