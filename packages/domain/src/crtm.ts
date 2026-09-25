/** GTFS service clock: local noon minus 12 elapsed hours, not civil midnight. */
export function gtfsServiceEpoch(serviceDate: string): number {
  const noon = Date.parse(`${serviceDate}T12:00:00Z`);
  if (
    !Number.isFinite(noon) ||
    new Date(noon).toISOString().slice(0, 10) !== serviceDate
  )
    throw new Error("invalid_service_date");
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Madrid",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(noon),
  );
  return noon - (hour - 12) * 3600000 - 12 * 3600000;
}
export function madridDate(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(
    now,
  );
}
export function gtfsClock(seconds: number): string {
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function gtfsInstant(date: string, seconds: number): string {
  return new Date(gtfsServiceEpoch(date) + seconds * 1000).toISOString();
}
