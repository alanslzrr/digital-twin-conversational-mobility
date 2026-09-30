import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseDailyForecast } from "./adapters/aemet-daily";
import { chooseWeather, type ForecastRow } from "./weather-selection";

const p = parseDailyForecast(
  readFileSync(
    new URL("./adapters/fixtures/weather/daily.xml", import.meta.url),
    "utf8",
  ),
  "28079",
);
const now = () => new Date().toISOString();
const daily = (): ForecastRow => ({
  resource: "daily:28079",
  payload: { ...p, ageBasis: now() },
  version: "daily",
  issued_at: now(),
  checked_at: now(),
  fetched_at: now(),
  valid_from: p.validFrom,
  valid_to: p.validTo,
  next_due_at: now(),
  error_code: null,
});
const hourly = (): ForecastRow => ({
  ...daily(),
  resource: "forecast:28079",
  version: "hourly",
  payload: {
    product: "forecast",
    municipality: "28079",
    name: "Madrid",
    issuedAt: now(),
    validFrom: "2026-10-01T00:00:00Z",
    validTo: "2026-10-02T00:00:00Z",
    timeZone: "Europe/Madrid",
    omittedAmbiguousPeriods: 0,
    periods: [
      {
        kind: "precipitation",
        unit: "mm",
        value: 0,
        period: "01",
        basis: "interval",
        validFrom: "2026-10-01T09:00:00Z",
        validTo: "2026-10-01T10:00:00Z",
      },
    ],
  },
});
const choose = (
  rows: ForecastRow[],
  explicit?: "hourly_forecast" | "daily_forecast",
) =>
  chooseWeather(
    rows,
    "28079",
    "2026-10-01T09:10:00Z",
    "2026-10-01T09:20:00Z",
    [],
    explicit,
  );
it("prefers complete recent hourly, but complete recent daily beats stale hourly", () => {
  const h = hourly(),
    d = daily();
  expect(choose([h, d])?.product).toBe("forecast");
  h.checked_at = new Date(Date.now() - 3600000).toISOString();
  expect(choose([h, d])).toMatchObject({
    product: "daily_forecast",
    reason: "hourly_not_recent",
    freshness: "recently_checked",
  });
  expect(choose([h, d], "hourly_forecast")?.product).toBe("forecast");
  expect(choose([h, d], "daily_forecast")?.reason).toBe(
    "explicit_daily_request",
  );
});
it("checks gaps not just global horizon and preserves explicit product", () => {
  const h = hourly(),
    d = daily();
  if (h.payload?.product === "forecast") h.payload.periods = [];
  expect(choose([h, d])).toMatchObject({
    product: "daily_forecast",
    reason: "hourly_coverage_partial",
  });
  expect(choose([h, d], "hourly_forecast")).toBeNull();
  d.issued_at = new Date(Date.now() - 86400001).toISOString();
  expect(choose([h, d])).toBeNull();
});
it("keeps partial, stale and absent coverage distinct without extending CAP", () => {
  const d = daily();
  if (d.payload?.product === "daily_forecast")
    d.payload.periods = d.payload.periods.filter((p) => p.kind === "sky");
  d.checked_at = new Date(Date.now() - 3600000).toISOString();
  expect(choose([d])).toMatchObject({
    freshness: "stale",
    prediction: { coverage: "partial" },
  });
  expect(
    chooseWeather([d], "28079", "2026-10-10T09:00Z", "2026-10-10T10:00Z", []),
  ).toBeNull();
  expect(
    chooseWeather(
      [d],
      "28079",
      "2026-10-01T09:10Z",
      "2026-10-01T09:20Z",
      [],
      "warnings",
    ),
  ).toBeNull();
});
