import type { DailyForecast, DailyWeatherPeriod } from "@mobility/contracts";
import { describe, expect, it } from "vitest";
import {
  dailyDefaultEnd,
  dailyIntervalValid,
  dailyIssueAgeBasis,
  selectDailyForecast,
} from "./daily-weather";

const period = (
  date: string,
  start: number,
  end: number,
  kind: DailyWeatherPeriod["kind"] = "precipitation_probability",
): DailyWeatherPeriod => ({
  date,
  originalPeriod: `${start}-${end}`,
  period: `${start}-${end}`,
  kind,
  unit: "%",
  value: 20,
  resolutionHours: (end - start) as 6 | 12 | 24,
  basis: "interval",
  validFrom: new Date(
    Date.parse(`${date}T00:00:00Z`) + start * 3600000,
  ).toISOString(),
  validTo: new Date(
    Date.parse(`${date}T00:00:00Z`) + end * 3600000,
  ).toISOString(),
});
const product = (periods: DailyWeatherPeriod[]): DailyForecast => ({
  product: "daily_forecast",
  municipality: "28079",
  name: "Madrid",
  issuedAt: null,
  issuedAtRaw: "2026-09-30T17:05:08",
  ageBasis: "2026-09-30T15:05:08Z",
  issueTimeZone: "unspecified",
  ageBasisInterpretation: "earliest_utc_or_madrid",
  validFrom: "2026-10-01T00:00:00Z",
  validTo: "2026-10-02T00:00:00Z",
  periods,
  extremes: [],
  invalidFields: 0,
});
describe("daily intervals", () => {
  it("uses finest complete resolution per variable without mixing parents", () => {
    const p = product([
      period("2026-10-01", 0, 24),
      period("2026-10-01", 0, 12),
      period("2026-10-01", 0, 6),
      period("2026-10-01", 6, 12),
      period("2026-10-01", 0, 24, "sky"),
    ]);
    const s = selectDailyForecast(
      p,
      "2026-10-01T01:00Z",
      "2026-10-01T10:00Z",
      [],
    );
    expect(s.coverage).toBe("covered");
    expect(s.periods.map((p) => p.resolutionHours)).toEqual([6, 6, 24]);
    expect(s.periods[0]?.validFrom).toBe("2026-10-01T00:00:00.000Z");
    p.periods = p.periods.filter((p) => p.period !== "6-12");
    expect(
      selectDailyForecast(p, "2026-10-01T01:00Z", "2026-10-01T10:00Z", [])
        .periods[0]?.resolutionHours,
    ).toBe(12);
  });
  it("chooses greatest partial coverage with fine resolution breaking ties", () => {
    const p = product([
      period("2026-10-01", 0, 6),
      period("2026-10-01", 0, 12),
      period("2026-10-01", 12, 18),
    ]);
    const s = selectDailyForecast(
      p,
      "2026-10-01T00:00Z",
      "2026-10-02T00:00Z",
      [],
    );
    expect(s.coverage).toBe("partial");
    expect(s.resolutions).toEqual([6]);
    expect(
      selectDailyForecast(p, "2026-10-03T00:00Z", "2026-10-04T00:00Z", [])
        .coverage,
    ).toBe("outside_horizon");
  });
  it("selects by overlap across local midnight and DST without shifting UTC blocks", () => {
    const p = product([
      period("2026-10-24", 18, 24),
      period("2026-10-25", 0, 24),
    ]);
    const start = "2026-10-25T00:00:00+02:00",
      end = "2026-10-26T00:00:00+01:00";
    const s = selectDailyForecast(p, start, end, []);
    expect(s.coverage).toBe("covered");
    expect(s.periods).toHaveLength(2);
    expect(dailyDefaultEnd(start)).toBe("2026-10-25T23:00:00.000Z");
    expect(Date.parse(end) - Date.parse(start)).toBe(25 * 3600000);
    expect(
      dailyIntervalValid(
        "2026-10-22T00:00:00+02:00",
        "2026-10-29T00:00:00+01:00",
      ),
    ).toBe(true);
    expect(
      dailyIntervalValid(
        "2026-10-22T00:00:00+02:00",
        "2026-10-29T00:00:01+01:00",
      ),
    ).toBe(false);
    expect(dailyDefaultEnd("2026-03-29T00:00:00+01:00")).toBe(
      "2026-03-29T22:00:00.000Z",
    );
  });
  it("retains sky/extrema as partial information without fabricating rain coverage", () => {
    const p = product([period("2026-10-01", 0, 24, "sky")]);
    p.extremes = [{ date: "2026-10-01", minimum: 12, maximum: 20, unit: "°C" }];
    const s = selectDailyForecast(
      p,
      "2026-10-01T09:00Z",
      "2026-10-01T10:00Z",
      [],
    );
    expect(s.coverage).toBe("partial");
    expect(s.extremes).toEqual(p.extremes);
    expect(s.precipitationOnFoot).toEqual([]);
  });
  it("takes earliest legitimate issue interpretation including repeated autumn hour", () => {
    expect(dailyIssueAgeBasis("2026-10-25T02:30:00")).toBe(
      "2026-10-25T00:30:00.000Z",
    );
    expect(dailyIssueAgeBasis("2026-01-25T02:30:00")).toBe(
      "2026-01-25T01:30:00.000Z",
    );
    for (const raw of [
      "2026-03-29T02:30:00",
      "2026-02-30T12:00:00",
      "2026-10-25T25:00:00",
    ])
      expect(() => dailyIssueAgeBasis(raw)).toThrow();
  });
});
