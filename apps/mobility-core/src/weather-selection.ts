import type { WeatherProduct } from "@mobility/contracts";
import { selectDailyForecast, selectForecast } from "@mobility/domain";
import { weatherFreshness } from "@mobility/provenance";
export type ForecastRow = {
  resource: string;
  payload: WeatherProduct | null;
  checked_at: Date | string | null;
  issued_at: Date | string | null;
  error_code: string | null;
  version: string | null;
  valid_from: Date | string | null;
  valid_to: Date | string | null;
  fetched_at: Date | string | null;
  next_due_at: Date | string;
};
const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null);
export function chooseWeather(
  rows: ForecastRow[],
  municipality: string,
  start: string,
  end: string,
  walks: { start: string; end: string }[],
  explicit?: "hourly_forecast" | "daily_forecast" | "warnings",
) {
  const candidates = rows.flatMap((row) => {
    const p = row.payload;
    if (
      !p ||
      p.product === "warnings" ||
      p.municipality !== municipality ||
      explicit === "warnings" ||
      (explicit === "daily_forecast" && p.product !== "daily_forecast") ||
      (explicit === "hourly_forecast" && p.product !== "forecast")
    )
      return [];
    const freshness = weatherFreshness(
      "forecast",
      iso(row.checked_at),
      iso(row.issued_at),
      row.error_code,
    );
    if (freshness === "unavailable") return [];
    const prediction =
      p.product === "forecast"
        ? {
            ...selectForecast(p, start, end, walks),
            extremes: undefined,
            resolutions: [
              ...new Set(
                p.periods
                  .filter((v) => v.basis === "interval")
                  .map(
                    (v) =>
                      (Date.parse(v.validTo) - Date.parse(v.validFrom)) /
                      3600000,
                  ),
              ),
            ],
            skyCoverage: undefined,
          }
        : selectDailyForecast(p, start, end, walks);
    if (prediction.coverage === "outside_horizon") return [];
    const rank =
      (prediction.coverage === "covered" ? 0 : 4) +
      (freshness === "recently_checked" ? 0 : 2) +
      (p.product === "forecast" ? 0 : 1);
    return [
      {
        prediction,
        freshness,
        product: p.product,
        resource: row.resource,
        version: row.version,
        rank,
      },
    ];
  });
  const choice = candidates.sort((a, b) => a.rank - b.rank)[0];
  if (!choice) return null;
  const hourly = rows.find((r) => r.resource === `forecast:${municipality}`);
  const hp = hourly?.payload;
  const reason =
    choice.product !== "daily_forecast"
      ? null
      : explicit === "daily_forecast"
        ? "explicit_daily_request"
        : hp?.product !== "forecast"
          ? "hourly_data_missing"
          : Date.parse(start) < Date.parse(hp.validFrom) ||
              Date.parse(end) > Date.parse(hp.validTo)
            ? "hourly_horizon_insufficient"
            : weatherFreshness(
                  "forecast",
                  iso(hourly?.checked_at ?? null),
                  iso(hourly?.issued_at ?? null),
                  hourly?.error_code ?? null,
                ) !== "recently_checked"
              ? "hourly_not_recent"
              : "hourly_coverage_partial";
  return { ...choice, reason };
}
