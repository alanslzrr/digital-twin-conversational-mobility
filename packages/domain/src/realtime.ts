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
