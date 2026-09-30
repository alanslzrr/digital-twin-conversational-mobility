import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDailyForecast } from "./aemet-daily";
import { fetchWeatherProduct } from "./journey-weather";

const fixture = readFileSync(
  new URL("./fixtures/weather/daily.xml", import.meta.url),
  "utf8",
);
const xml = (
  fields: string,
  date = "2026-10-25",
  issue = "2026-10-24T17:00:00",
) =>
  `<root id="28079"><nombre>Madrid</nombre><elaborado>${issue}</elaborado><prediccion><dia fecha="${date}">${fields}</dia></prediccion></root>`;
afterEach(() => vi.unstubAllGlobals());
describe("daily AEMET XML", () => {
  it("parses real reduced publication without treating empty as zero", () => {
    const p = parseDailyForecast(fixture, "28079");
    expect(p.issuedAt).toBeNull();
    expect(p.issuedAtRaw).toBe("2026-09-30T17:05:08");
    expect(p.ageBasis).toBe("2026-09-30T15:05:08.000Z");
    expect(p.invalidFields).toBe(0);
    expect(
      p.periods.some(
        (p) =>
          p.date === "2026-09-30" &&
          p.kind === "precipitation_probability" &&
          p.period === "00-24",
      ),
    ).toBe(false);
    expect(
      p.periods.some(
        (p) => p.kind === "precipitation_probability" && p.value === 0,
      ),
    ).toBe(true);
    expect(p.extremes).toHaveLength(7);
  });
  it("keeps absent period, UTC midnight, daily extrema and optional invalid fields", () => {
    const p = parseDailyForecast(
      xml(
        '<prob_precipitacion>0</prob_precipitacion><estado_cielo periodo="18-24" descripcion="Despejado">11</estado_cielo><temperatura><minima>-1</minima><maxima>12</maxima></temperatura>',
      ),
      "28079",
    );
    expect(p.periods[0]).toMatchObject({
      originalPeriod: null,
      resolutionHours: 24,
      value: 0,
      validFrom: "2026-10-25T00:00:00.000Z",
    });
    expect(p.periods[1]).toMatchObject({
      validTo: "2026-10-26T00:00:00.000Z",
      description: "Despejado",
    });
    expect(p.extremes[0]).toMatchObject({
      date: "2026-10-25",
      minimum: -1,
      maximum: 12,
    });
    const bad = parseDailyForecast(
      xml(
        '<prob_precipitacion periodo="oops">20</prob_precipitacion><prob_precipitacion periodo="00-06">101</prob_precipitacion><estado_cielo>11</estado_cielo><temperatura><minima>22</minima><maxima>12</maxima></temperatura>',
      ),
      "28079",
    );
    expect(bad.invalidFields).toBe(3);
    expect(bad.periods).toHaveLength(1);
    expect(bad.extremes).toEqual([]);
  });
  it("rejects unsafe XML, wrong municipality, invalid dates and duplicate dates", () => {
    for (const bad of [
      `<!DOCTYPE root [<!ENTITY x "oops">]>${fixture}`,
      fixture.slice(0, -8),
      fixture.replace('fecha="2026-09-30"', 'fecha="2026-02-30"'),
      fixture.replace('fecha="2026-10-01"', 'fecha="2026-09-30"'),
    ])
      expect(() => parseDailyForecast(bad, "28079")).toThrow();
    expect(() => parseDailyForecast(fixture, "28005")).toThrow();
  });
  it("conditionally validates without rejuvenating identical data and rejects empty 304", async () => {
    const payload = parseDailyForecast(fixture, "28079");
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetch);
    expect(
      await fetchWeatherProduct("daily:28079", AbortSignal.timeout(1000), {
        payload,
        lastModified: "Wed, 30 Sep 2026 17:06:35 GMT",
      }),
    ).toEqual({ notModified: true });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://www.aemet.es/xml/municipios/localidad_28079.xml",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      redirect: "error",
      headers: { "If-Modified-Since": "Wed, 30 Sep 2026 17:06:35 GMT" },
    });
    await expect(
      fetchWeatherProduct("daily:28079", AbortSignal.timeout(1000), {
        payload: null,
        lastModified: null,
      }),
    ).rejects.toThrow("weather_304_without_state");
    fetch.mockResolvedValue(new Response(fixture));
    expect(
      await fetchWeatherProduct("daily:28079", AbortSignal.timeout(1000), {
        payload,
        lastModified: null,
      }),
    ).toEqual({ notModified: true });
  });
});
