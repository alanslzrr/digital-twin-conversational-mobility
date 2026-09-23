import { describe, expect, it } from "vitest";
import { parseWeather, weatherResource } from "./aemet";

const now = Date.parse("2026-09-23T19:00:00Z");
const row = {
  idema: "3195",
  ubi: "MADRID RETIRO",
  lat: 40.411389,
  lon: -3.677778,
  fint: "2026-09-23T18:00:00+0000",
  ta: 21.5,
  hr: 41,
  prec: 0,
  vv: 1.5,
};
describe("AEMET observations", () => {
  it("uses UTC metadata, not local civil time, and keeps zero rainfall", () => {
    const result = parseWeather([row], now);
    expect(result.observedAt).toBe("2026-09-23T18:00:00.000Z");
    expect(
      result.readings[0]?.measurements.find((m) => m.name === "precipitation"),
    ).toEqual({
      name: "precipitation",
      value: 0,
      unit: "mm",
      periodMinutes: 60,
    });
    expect(
      parseWeather([{ ...row, fint: "2026-09-23T18:00:00" }], now).observedAt,
    ).toBe(result.observedAt);
  });
  it("selects latest valid observations regardless of feed ordering", () => {
    const result = parseWeather(
      [
        row,
        { ...row, fint: "2026-09-23T15:00:00Z", ta: 30 },
        { ...row, fint: "2026-09-23T20:00:00Z" },
        { ...row, fint: "2026-02-31T12:00:00Z" },
      ],
      now,
    );
    expect(result.readings).toHaveLength(1);
    expect(result.readings[0]?.measurements[0]?.value).toBe(21.5);
  });
  it("does not manufacture missing values or accept impossible humidity", () => {
    const result = parseWeather([{ ...row, ta: null, vv: undefined }], now);
    expect(result.readings[0]?.measurements.map((m) => m.name)).toEqual([
      "relative_humidity",
      "precipitation",
    ]);
    expect(() => parseWeather([{ ...row, hr: 101 }], now)).toThrow();
    expect(() => parseWeather([], now)).toThrow();
  });
  it("restricts resource fetches to the official host and data path", () => {
    expect(
      weatherResource("https://opendata.aemet.es/opendata/sh/abc123"),
    ).toContain("/sh/abc123");
    for (const url of [
      "http://opendata.aemet.es/opendata/sh/abc",
      "https://opendata.aemet.es.evil.test/opendata/sh/abc",
      "https://user:pass@opendata.aemet.es/opendata/sh/abc",
      "https://opendata.aemet.es:8443/opendata/sh/abc",
      "https://opendata.aemet.es/opendata/sh/abc?api_key=secret",
      "https://127.0.0.1/opendata/sh/abc",
      "https://opendata.aemet.es/elsewhere",
    ])
      expect(() => weatherResource(url)).toThrow();
  });
});
