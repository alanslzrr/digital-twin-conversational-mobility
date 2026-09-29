// Service validity is not an accessibility inspection date.
export function accessibilityServiceEnvelope(
  start: string | null,
  end: string | null,
  now = new Date(),
) {
  if (!start || !end) return null;
  const day = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
  }).format(now);
  return day >= start && day <= end;
}
