export function weatherFreshness(
  product: "forecast" | "warnings",
  checkedAt: string | null,
  issuedAt: string | null,
  error: string | null,
  now = Date.now(),
) {
  if (!checkedAt || !issuedAt) return "unavailable" as const;
  const age = now - Date.parse(checkedAt),
    issuedAge = now - Date.parse(issuedAt);
  // No indefinite stale forecasts. Warnings retain original validity but never imply current all-clear when old.
  if (
    !Number.isFinite(age) ||
    !Number.isFinite(issuedAge) ||
    age < -30000 ||
    issuedAge < -300000 ||
    age > 86400000 ||
    (product === "forecast" && issuedAge > 86400000)
  )
    return "unavailable" as const;
  return !error && age <= (product === "forecast" ? 1800000 : 300000)
    ? ("recently_checked" as const)
    : ("stale" as const);
}
