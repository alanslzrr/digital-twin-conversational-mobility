import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  products: vi.fn(),
  read: vi.fn(),
}));
vi.mock("./database", () => ({
  weatherDatabase: () => Object.assign(mocks.sql, { json: (x: unknown) => x }),
}));
vi.mock("./weather-cache", () => ({
  weatherProducts: mocks.products,
  readWeatherProducts: mocks.read,
}));

import { parseDailyForecast } from "./adapters/aemet-daily";
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
  const rows = [
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
  ];
  mocks.products.mockReset().mockResolvedValue(rows);
  mocks.read.mockReset().mockResolvedValue(rows);
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
    "daily:28005",
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

it("evidence order is stable and relevance changes with freshness", async () => {
  const fresh = await journeyWeather([route], point, point);
  const rows = await mocks.read();
  const stale = rows.map((r: Record<string, unknown>) => ({
    ...r,
    error_code: "upstream_timeout",
  }));
  mocks.read.mockResolvedValue(stale);
  mocks.products.mockResolvedValue(stale);
  const old = await journeyWeather([route], point, point);
  expect(old.alternatives[0]?.relevanceKey).not.toBe(
    fresh.alternatives[0]?.relevanceKey,
  );
  expect(old.evidence.map((e) => e.key)).toEqual(
    [...old.evidence.map((e) => e.key)].sort(),
  );
});

const daily = parseDailyForecast(
  readFileSync(
    new URL("./adapters/fixtures/weather/daily.xml", import.meta.url),
    "utf8",
  ),
  "28079",
);
it.each([
  [undefined, "2026-10-03T10:00:00Z", "forecast_unavailable"],
  ["daily_forecast", "2026-10-03T10:00:00Z", "forecast_unavailable"],
  [undefined, "2026-10-10T10:00:00Z", "outside_horizon"],
  ["hourly_forecast", "2026-10-03T10:00:00Z", "outside_horizon"],
] as const)(
  "diagnoses unavailable forecasts for %s at %s as %s",
  async (product, start, status) => {
    const now = "2026-10-01T18:00:00Z";
    vi.mocked(Date.now).mockReturnValue(Date.parse(now));
    const rows = [
      {
        resource: "daily:28079",
        payload: daily,
        version: "daily",
        issued_at: daily.ageBasis,
        checked_at: now,
        fetched_at: now,
        valid_from: daily.validFrom,
        valid_to: daily.validTo,
        next_due_at: "2026-10-01T18:30:00Z",
        error_code: null,
      },
      {
        resource: "forecast:28079",
        payload: {
          ...forecast,
          issuedAt: now,
          validFrom: "2026-10-01T00:00:00Z",
          validTo: "2026-10-02T18:00:00Z",
          periods: [],
        },
        version: "hourly",
        issued_at: now,
        checked_at: now,
        fetched_at: now,
        valid_from: "2026-10-01T00:00:00Z",
        valid_to: "2026-10-02T18:00:00Z",
        next_due_at: "2026-10-01T18:30:00Z",
        error_code: null,
      },
    ];
    for (const f of [mocks.read, mocks.products])
      f.mockImplementation(async (resources: string[]) =>
        rows.filter((r) => resources.includes(r.resource)),
      );
    const end = new Date(Date.parse(start) + 3600000).toISOString();
    const future = {
      start,
      end,
      legs: [
        {
          mode: "CONTEXT",
          from: {},
          to: {},
          start: { scheduledTime: start },
          end: { scheduledTime: end },
        },
      ],
    };
    const result = await journeyWeather([future], point, point, product);
    expect(result.status).toBe("evaluated");
    expect(
      result.alternatives[0]?.points.every((p) => p.status === status),
    ).toBe(true);
    expect(result.periods).toEqual([]);
    if (status === "forecast_unavailable")
      expect(
        result.evidence.find((e) => e.key === "daily:28079")?.freshness,
      ).toBe("unavailable");
  },
);

it("stored weather inspection never demands or acquires municipal products", async () => {
  mocks.products.mockImplementation(async () => {
    throw new Error("Demand/acquisition forbidden");
  });
  const result = await journeyWeather(
    [route],
    point,
    point,
    "hourly_forecast",
    false,
  );
  expect(result.status).toBe("evaluated");
  expect(mocks.read).toHaveBeenCalledOnce();
  expect(mocks.products).not.toHaveBeenCalled();
});
