import { describe, expect, it, vi } from "vitest";
import { parseWeather, weatherResource } from "./aemet";
import excerpt from "./fixtures/aemet-regional-excerpt.json";

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

describe("regional extraction", () => {
  it("filters before normalization including out-of-polygon Navacerrada", async () => {
    const { regionalWeatherExtract } = await import("./aemet");
    const regional = regionalWeatherExtract([
      row,
      { ...row, idema: "2462", alt: 1892.6 },
      { ...row, idema: "foreign", hr: 999 },
      { idema: "3121F" },
    ]);
    expect(regional.scope).toBe("aemet_madrid_initial_25_stations");
    expect(regional.records).toHaveLength(3);
    const parsed = parseWeather(regional.records, now);
    expect(parsed.readings).toHaveLength(2);
    expect(
      parsed.readings.find((r) => r.stationId === "2462")?.altitudeMeters,
    ).toBe(1892.6);
  });
  it("retains each station time without filling missing measurements", () => {
    const result = parseWeather(
      [
        row,
        {
          ...row,
          idema: "3100B",
          fint: "2026-09-23T12:00:00Z",
          ta: null,
          hr: null,
        },
      ],
      now,
    );
    expect(
      result.readings.find((r) => r.stationId === "3100B")?.observedAt,
    ).toBe("2026-09-23T12:00:00.000Z");
    expect(
      result.readings
        .find((r) => r.stationId === "3100B")
        ?.measurements.some((m) => m.name === "temperature"),
    ).toBe(false);
  });
});

it("acquires one envelope and one nationwide file and retains only regional records", async () => {
  const { fetchWeather } = await import("./aemet");
  vi.stubEnv("AEMET_API_KEY", "test-only");
  const recent = { ...row, fint: new Date(Date.now() - 60000).toISOString() };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          estado: 200,
          datos: "https://opendata.aemet.es/opendata/sh/test",
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify([recent, { ...recent, idema: "foreign" }])),
    );
  vi.stubGlobal("fetch", fetcher);
  try {
    const result = await fetchWeather();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://opendata.aemet.es/opendata/api/observacion/convencional/todas",
    );
    expect(JSON.parse(result.raw).records).toHaveLength(1);
    expect(result.raw).not.toContain("foreign");
    expect(result.raw).not.toContain("test-only");
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

it("normalizes the recorded official regional excerpt with separate station times", () => {
  const result = parseWeather(excerpt, Date.parse("2026-10-01T00:00:00Z"));
  expect(result.readings).toHaveLength(4);
  expect(
    result.readings.find((r) => r.stationId === "2462")?.altitudeMeters,
  ).toBe(1892.6);
});
