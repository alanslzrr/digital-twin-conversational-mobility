// Keep the publisher status separate: DATEX active overrides its time specification.
// Elapsed ends are therefore reported as conflicts, not invented confirmations.
export function dgtTemporalStatus(
  r: {
    informationStatus: string;
    complexValidity: boolean;
    startsAt: string;
    endsAt: string | null;
    providerValidity: string;
  },
  now = Date.now(),
) {
  if (
    r.informationStatus !== "real" ||
    r.complexValidity ||
    (r.endsAt && Date.parse(r.startsAt) > Date.parse(r.endsAt))
  )
    return "unknown";
  if (r.providerValidity === "active")
    return Date.parse(r.startsAt) > now ||
      (r.endsAt && Date.parse(r.endsAt) < now)
      ? "published_active_time_conflict"
      : "published_active";
  if (r.providerValidity === "planned") return "planned";
  return "unknown";
}
