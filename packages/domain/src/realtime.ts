type TripIdentity = {
  tripId: string;
  startDate?: string | undefined;
  observedAt: string;
};
function madridServiceDate(time: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(time))
    .replaceAll("-", "");
}

// A trip ID can repeat on successive service days. Without an explicit date,
// prefer a scheduled fallback over applying yesterday's/new day's estimates.
export function sameServiceTrip(
  update: TripIdentity,
  tripId: string,
  serviceDay: number,
) {
  if (
    update.tripId !== tripId ||
    !Number.isFinite(serviceDay) ||
    !Number.isFinite(Date.parse(update.observedAt))
  )
    return false;
  const day =
    update.startDate ?? madridServiceDate(Date.parse(update.observedAt));
  return day === madridServiceDate(serviceDay * 1000);
}

export function alertPeriodStatus(
  periods: readonly { start?: number; end?: number }[],
  nowSeconds: number,
) {
  // No period means the publisher did not provide temporal evidence.
  if (!periods.length) return "unknown";
  const states = periods.map(({ start, end }) => {
    if (
      (start !== undefined && !Number.isFinite(start)) ||
      (end !== undefined && !Number.isFinite(end)) ||
      (start !== undefined && end !== undefined && start > end)
    )
      return "unknown";
    if (end !== undefined && end < nowSeconds) return "expired";
    if (start !== undefined && start > nowSeconds) return "upcoming";
    return start !== undefined || end !== undefined ? "active" : "unknown";
  });
  if (states.includes("active")) return "active";
  if (states.includes("unknown")) return "unknown";
  return states.includes("upcoming") ? "upcoming" : "expired";
}
