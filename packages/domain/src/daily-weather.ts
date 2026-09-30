import type { DailyForecast, DailyWeatherPeriod } from "@mobility/contracts";
import { madridDate } from "./crtm";
import { weatherCovers, weatherOverlaps } from "./journey-weather";

const civilFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export function dailyIssueAgeBasis(raw: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw))
    throw Error("weather_issue_time_invalid");
  const utc = Date.parse(`${raw}Z`);
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 19) !== raw)
    throw Error("weather_issue_time_invalid");
  const civil = [1, 2]
    .map((offset) => utc - offset * 3600000)
    .filter((instant) => civilFormat.format(instant).replace(" ", "T") === raw);
  if (!civil.length) throw Error("weather_issue_time_unusable");
  return new Date(Math.min(utc, ...civil)).toISOString();
}
export function dailyDefaultEnd(start: string) {
  const date = madridDate(new Date(start));
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
  // Midnight is unique in modern Europe/Madrid; verify rather than assume an offset.
  const utc = Date.parse(`${next}T00:00:00Z`);
  const candidates = [1, 2]
    .map((o) => utc - o * 3600000)
    .filter(
      (n) => civilFormat.format(n).replace(" ", "T") === `${next}T00:00:00`,
    );
  if (candidates.length !== 1) throw Error("weather_period_invalid");
  return new Date(candidates[0] as number).toISOString();
}
export function dailyIntervalValid(start: string, end: string) {
  const a = Date.parse(start),
    b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return false;
  const first = madridDate(new Date(a)),
    last = madridDate(new Date(b - 1));
  return (Date.parse(last) - Date.parse(first)) / 86400000 < 7;
}
export function selectDailyForecast(
  product: DailyForecast,
  start: string,
  end: string,
  walks: { start: string; end: string }[],
) {
  const selected: DailyWeatherPeriod[] = [];
  for (const date of new Set(product.periods.map((p) => p.date))) {
    const a = Math.max(Date.parse(start), Date.parse(`${date}T00:00:00Z`));
    const b = Math.min(
      Date.parse(end),
      Date.parse(`${date}T00:00:00Z`) + 86400000,
    );
    if (b <= a) continue;
    for (const kind of ["precipitation_probability", "sky"] as const) {
      const choices = ([6, 12, 24] as const).map((resolution) => {
        const periods = product.periods.filter(
          (p) =>
            p.date === date &&
            p.kind === kind &&
            p.resolutionHours === resolution &&
            weatherOverlaps(p.validFrom, p.validTo, start, end),
        );
        // Parser only admits disjoint canonical blocks within one resolution.
        const covered = periods.reduce(
          (n, p) =>
            n +
            Math.max(
              0,
              Math.min(b, Date.parse(p.validTo)) -
                Math.max(a, Date.parse(p.validFrom)),
            ),
          0,
        );
        return {
          periods,
          covered,
          complete: weatherCovers(
            periods,
            new Date(a).toISOString(),
            new Date(b).toISOString(),
          ),
        };
      });
      const choice =
        choices.find((c) => c.complete) ??
        choices.sort((x, y) => y.covered - x.covered)[0];
      selected.push(...(choice?.periods ?? []));
    }
  }
  const extremes = product.extremes.filter((e) =>
    weatherOverlaps(
      `${e.date}T00:00:00Z`,
      new Date(Date.parse(`${e.date}T00:00:00Z`) + 86400000).toISOString(),
      start,
      end,
    ),
  );
  return {
    coverage: weatherCovers(
      selected.filter((p) => p.kind === "precipitation_probability"),
      start,
      end,
    )
      ? "covered"
      : selected.length || extremes.length
        ? "partial"
        : "outside_horizon",
    periods: selected.slice(0, 80),
    truncated: selected.length > 80,
    extremes,
    skyCoverage: weatherCovers(
      selected.filter((p) => p.kind === "sky"),
      start,
      end,
    )
      ? "covered"
      : "partial_or_absent",
    resolutions: [...new Set(selected.map((p) => p.resolutionHours))],
    precipitationOnFoot: selected
      .filter(
        (p) =>
          p.kind === "precipitation_probability" &&
          typeof p.value === "number" &&
          p.value > 0 &&
          walks.some((w) =>
            weatherOverlaps(p.validFrom, p.validTo, w.start, w.end),
          ),
      )
      .slice(0, 24),
  };
}
