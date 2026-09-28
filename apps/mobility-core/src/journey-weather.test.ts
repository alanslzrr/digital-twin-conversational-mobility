import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sql: vi.fn(), products: vi.fn() }));
vi.mock("./database", () => ({
  weatherDatabase: () => Object.assign(mocks.sql, { json: (x: unknown) => x }),
}));
vi.mock("./weather-cache", () => ({ weatherProducts: mocks.products }));

import { parseHourlyForecast } from "./adapters/aemet-forecast";
import { journeyWeather } from "./journey-weather";

const forecast = parseHourlyForecast(
  JSON.parse(
    readFileSync(
      new URL("./adapters/fixtures/weather/hourly.json", import.meta.url),
      "utf8",
    ),
  ),
  "28079",
);
const route = {
  start: "2026-09-28T18:10:00Z",
  end: "2026-09-28T18:30:00Z",
  legs: [
    {
      mode: "WALK",
      from: {},
      to: {},
      start: { scheduledTime: "2026-09-28T18:10:00Z" },
      end: { scheduledTime: "2026-09-28T18:30:00Z" },
    },
  ],
};
const point = { latitude: 40.4, longitude: -3.7 };
beforeEach(() => {
  mocks.sql.mockReset().mockImplementation(async (_q, ...args) =>
    args[0].map((s: { key: string }) => ({
      ...s,
      code: "28079",
      name: "Madrid",
      source_version: "official-fixture",
    })),
  );
  mocks.products.mockReset().mockResolvedValue([
    {
      resource: "forecast:28079",
      payload: forecast,
      version: "v1",
      issued_at: forecast.issuedAt,
      checked_at: "2026-09-28T18:00:00Z",
      fetched_at: "2026-09-28T18:00:00Z",
      valid_from: forecast.validFrom,
      valid_to: forecast.validTo,
      error_code: null,
    },
  ]);
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-28T18:10:00Z"));
});
afterEach(() => vi.restoreAllMocks());
it("shares products and compact period references across alternatives and known walking", async () => {
  const r = await journeyWeather([route, route], point, point);
  expect(r.status).toBe("evaluated");
  expect(mocks.products.mock.calls[0]?.[0]).toEqual([
    "warnings:28",
    "forecast:28079",
  ]);
  expect(r.alternatives).toHaveLength(2);
  expect(r.alternatives[0]?.relevanceKey).toBe(r.alternatives[1]?.relevanceKey);
  expect(r.periods?.some((p) => p.value.period === "2002")).toBe(true);
  expect(new Set(r.periods?.map((p) => p.id)).size).toBe(r.periods?.length);
  expect(JSON.stringify(r)).not.toContain('"polygons":');
});
it("keeps unknown geographic coverage explicit without contacting a provider", async () => {
  mocks.sql.mockResolvedValue([]);
  const r = await journeyWeather([route], point, point);
  expect(r.coverage?.unknownPoints).toBeGreaterThan(0);
  expect(mocks.products).not.toHaveBeenCalled();
});
it("aggregates two municipalities and preserves unmapped transfer points", async () => {
  mocks.sql.mockResolvedValue([
    { key: "0:origin", ...point, code: "28079", name: "Madrid" },
    { key: "0:destination", ...point, code: "28005", name: "Alcalá" },
  ]);
  const r = await journeyWeather([route], point, point);
  expect(mocks.products.mock.calls[0]?.[0]).toEqual([
    "warnings:28",
    "forecast:28079",
    "forecast:28005",
  ]);
  expect(r.coverage?.unknownPoints).toBe(2);
});
it("does not inherit today's forecast outside its horizon", async () => {
  const future = {
    ...route,
    start: "2027-01-01T00:00:00Z",
    end: "2027-01-01T00:10:00Z",
    legs: [],
  };
  const r = await journeyWeather([future], point, point);
  expect(r.periods).toEqual([]);
  expect(JSON.stringify(r)).toContain("outside_horizon");
});
it("storage failure is a separate meteorological limitation", async () => {
  mocks.sql.mockRejectedValue(Error("unavailable"));
  expect(await journeyWeather([route], point, point)).toMatchObject({
    status: "unavailable",
  });
});
it("one abort signal bounds the entire cold enrichment, not each alternative", async () => {
  mocks.products.mockImplementation(
    (_r, s: AbortSignal) =>
      new Promise((_resolve, reject) =>
        s.addEventListener("abort", () => reject(s.reason), { once: true }),
      ),
  );
  const start = performance.now();
  const r = await journeyWeather([route, route, route], point, point);
  expect(performance.now() - start).toBeLessThan(3000);
  expect(r.status).toBe("unavailable");
  expect(mocks.products).toHaveBeenCalledTimes(1);
});
