import type {
  MadridWarnings,
  MunicipalForecast,
  WeatherAlert,
} from "@mobility/contracts";
import { expect, it } from "vitest";
import {
  polygonContains,
  selectForecast,
  selectWarnings,
  weatherRelevance,
} from "./journey-weather";

const start = "2026-09-28T10:00:00Z",
  end = "2026-09-28T11:00:00Z";
const forecast: MunicipalForecast = {
  product: "forecast",
  municipality: "28079",
  name: "Madrid",
  issuedAt: start,
  validFrom: start,
  validTo: end,
  timeZone: "Europe/Madrid",
  omittedAmbiguousPeriods: 0,
  periods: [
    {
      kind: "precipitation",
      value: 0.2,
      unit: "mm",
      period: "12",
      validFrom: start,
      validTo: end,
      basis: "interval",
    },
    {
      kind: "precipitation_probability",
      value: 90,
      unit: "%",
      period: "0814",
      validFrom: "2026-09-28T06:00:00Z",
      validTo: "2026-09-28T12:00:00Z",
      basis: "interval",
    },
  ],
};
const area = {
  code: "722802",
  name: "fixture",
  polygons: [
    [
      [-4, 40],
      [-3, 40],
      [-3, 41],
      [-4, 41],
      [-4, 40],
    ],
  ],
};
const alert: WeatherAlert = {
  id: "one",
  sent: start,
  references: [],
  messageType: "Alert",
  phenomenon: "PR",
  severity: "Minor",
  level: "verde",
  event: "fixture",
  validFrom: start,
  validTo: end,
  areas: [area],
};
const warnings: MadridWarnings = {
  product: "warnings",
  issuedAt: start,
  validFrom: start,
  validTo: end,
  records: ["AT", "BT", "NE", "NI", "PR", "TO", "VI", "VS"].map(
    (phenomenon) => ({ ...alert, phenomenon }),
  ),
};
it("requires time and spatial coverage before all-clear, even with fresh complete publication", () => {
  expect(
    selectWarnings(
      warnings,
      { latitude: 40.5, longitude: -3.5 },
      start,
      end,
      true,
    ).status,
  ).toBe("no_applicable_warnings");
  expect(
    selectWarnings(
      warnings,
      { latitude: 40.5, longitude: -3.5 },
      start,
      end,
      false,
    ).status,
  ).toBe("unknown");
  expect(
    selectWarnings(
      warnings,
      { latitude: 40.5, longitude: -3.5 },
      start,
      "2026-09-28T12:00:00Z",
      true,
    ).status,
  ).toBe("unknown");
  expect(
    polygonContains({ latitude: 40, longitude: -4 }, area.polygons[0] ?? []),
  ).toBe("boundary");
  expect(
    selectWarnings(warnings, { latitude: 40, longitude: -4 }, start, end, true)
      .status,
  ).toBe("ambiguous_area");
});
it("keeps interval probabilities and scopes rain to known walking intervals", () => {
  const selected = selectForecast(forecast, start, end, [{ start, end }]);
  expect(selected.precipitationOnFoot).toHaveLength(2);
  expect(selected.periods[1]?.period).toBe("0814");
  expect(
    selectForecast(forecast, "2027-01-01T10:00:00Z", "2027-01-01T11:00:00Z", [])
      .coverage,
  ).toBe("outside_horizon");
  expect(
    selectForecast(forecast, start, end, []).precipitationOnFoot,
  ).toHaveLength(0);
});
it("ignores timestamp/ID and small rain-value changes but detects warning level and applicable period", () => {
  const key = (w: MadridWarnings, f = forecast) =>
    weatherRelevance([
      {
        municipality: "28079",
        warnings: selectWarnings(
          w,
          { latitude: 40.5, longitude: -3.5 },
          start,
          end,
          true,
        ),
        precipitationOnFoot: selectForecast(f, start, end, [{ start, end }])
          .precipitationOnFoot,
      },
    ]);
  expect(
    key({
      ...warnings,
      issuedAt: end,
      records: warnings.records.map((r) => ({
        ...r,
        id: "changed",
        sent: end,
      })),
    }),
  ).toBe(key(warnings));
  expect(
    key(warnings, {
      ...forecast,
      periods: forecast.periods.map((p) => ({ ...p, value: 0.3 })),
    }),
  ).toBe(key(warnings));
  expect(
    key({
      ...warnings,
      records: [{ ...alert, severity: "Severe", level: "naranja" }],
    }),
  ).not.toBe(key(warnings));
});
