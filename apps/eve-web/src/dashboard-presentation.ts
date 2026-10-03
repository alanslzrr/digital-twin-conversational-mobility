/** Presentation-only helpers: never enrich or fabricate domain evidence. */
export function madridLocal(instant: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (name: string) => parts.find((p) => p.type === name)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
/** Recent Europe/Madrid civil times have CET and CEST candidates. Verify by round-trip. */
export function madridCandidates(
  local: string,
): { instant: string; offset: string }[] {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return [];
  return ["+01:00", "+02:00"].flatMap((offset) => {
    const date = new Date(`${local}:00${offset}`);
    if (!Number.isFinite(date.getTime())) return [];
    const instant = date.toISOString();
    return madridLocal(instant) === local ? [{ instant, offset }] : [];
  });
}
export function readState(
  data: unknown,
  loading: boolean,
  error: unknown,
): "loading" | "failed" | "cached_failure" | "ready" {
  if (data !== undefined && data !== null)
    return error ? "cached_failure" : "ready";
  return error ? "failed" : loading ? "loading" : "loading";
}
export function successfulReadAt(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("readAt" in data)) return null;
  return typeof data.readAt === "string" &&
    Number.isFinite(Date.parse(data.readAt))
    ? data.readAt
    : null;
}
