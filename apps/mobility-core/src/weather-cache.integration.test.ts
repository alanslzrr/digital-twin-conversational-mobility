import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const fixture = vi.hoisted(() => ({
  sql: null as ReturnType<typeof postgres> | null,
  fetch: vi.fn(),
}));
vi.mock("./database", () => ({ weatherDatabase: () => fixture.sql }));
vi.mock("./adapters/journey-weather", async (original) => ({
  ...(await original<object>()),
  fetchWeatherProduct: fixture.fetch,
}));

import { WeatherHttpError } from "./adapters/journey-weather";
import { journeyWeather } from "./journey-weather";
import {
  readWeatherProducts,
  refreshWeather,
  weatherProducts,
  weatherWorkerTick,
} from "./weather-cache";

const schema = `weather_test_${randomUUID().replaceAll("-", "")}`;
let admin: ReturnType<typeof postgres>, sql: ReturnType<typeof postgres>;
const payload = () => ({
  product: "warnings",
  issuedAt: new Date().toISOString(),
  validFrom: new Date().toISOString(),
  validTo: new Date(Date.now() + 86400000).toISOString(),
  records: [],
});
const signal = () => AbortSignal.timeout(2000);
describe.skipIf(process.env.RUN_WEATHER_DB_TESTS !== "1")(
  "shared weather cache in isolated PostgreSQL schema",
  () => {
    beforeAll(async () => {
      const url = process.env.DATABASE_URL;
      if (
        !url ||
        !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
      )
        throw Error("Local database required");
      admin = postgres(url, { max: 1, onnotice: () => {} });
      await admin.unsafe(`CREATE SCHEMA ${schema}`);
      sql = postgres(url, {
        max: 2,
        ...{ max_pipeline: 0 }, // Supported by pinned postgres.js 3.4.9; absent from its Options type.
        connection: { search_path: `${schema},public` },
        onnotice: () => {},
      });
      fixture.sql = sql;
      for (const name of [
        "0001_foundation.sql",
        "0004_local_mobility.sql",
        "0013_emt_catalog_arrivals.sql",
        "0014_crtm_static.sql",
        "0016_routing_releases.sql",
        "0018_journey_weather.sql",
        "0020_daily_weather.sql",
      ])
        await sql.unsafe(
          await readFile(
            new URL(
              `../../../infra/postgres/migrations/${name}`,
              import.meta.url,
            ),
            "utf8",
          ),
        );
    });
    beforeEach(async () => {
      vi.stubEnv("INGESTION_ENABLED", "true");
      vi.stubEnv("VERCEL", "");
      fixture.fetch.mockReset().mockImplementation(async () => ({
        notModified: false,
        payload: payload(),
        lastModified: "Mon, 28 Sep 2026 19:00:00 GMT",
      }));
      await sql`TRUNCATE weather_product`;
      await sql`UPDATE weather_gate SET next_due_at=now(),lease_token=NULL,lease_until=NULL`;
      await sql`UPDATE source_catalog SET enabled=true WHERE id='aemet'`;
      await sql`UPDATE ingestion_activity SET active_until=now()+interval '30 minutes'`;
    });
    afterAll(async () => {
      vi.unstubAllEnvs();
      await sql?.end();
      if (admin) {
        await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
        await admin.end();
      }
    });
    it("retains 25 resource demands with one acquisition and reads without renewing demand", async () => {
      const resources = [
        "warnings:28",
        ...Array.from({ length: 12 }, (_, i) => [
          `forecast:${28001 + i}`,
          `daily:${28001 + i}`,
        ]).flat(),
      ];
      await weatherProducts(resources, signal());
      expect(
        (await sql`SELECT count(*)::int n FROM weather_product`)[0]?.n,
      ).toBe(25);
      expect(fixture.fetch).toHaveBeenCalledTimes(1);
      await sql`UPDATE weather_product SET demanded_until=now()-interval '1 second'`;
      expect(await readWeatherProducts(resources, signal())).toHaveLength(25);
      expect(
        (
          await sql`SELECT count(*)::int n FROM weather_product WHERE demanded_until>now()`
        )[0]?.n,
      ).toBe(0);
    });
    it("shares daily state across five readers, retains age on 304 and accepts equal-issue corrections", async () => {
      const daily = {
        product: "daily_forecast",
        municipality: "28079",
        name: "Madrid",
        issuedAt: null,
        issuedAtRaw: "2026-09-30T17:05:08",
        ageBasis: "2026-09-30T15:05:08.000Z",
        issueTimeZone: "unspecified",
        ageBasisInterpretation: "earliest_utc_or_madrid",
        validFrom: "2026-09-30T00:00:00Z",
        validTo: "2026-10-07T00:00:00Z",
        periods: [],
        extremes: [],
        invalidFields: 0,
      };
      fixture.fetch.mockResolvedValue({
        notModified: false,
        payload: daily,
        lastModified: "Wed, 30 Sep 2026 17:06:35 GMT",
      });
      await Promise.all(
        Array.from({ length: 5 }, () =>
          weatherProducts(["daily:28079"], signal()),
        ),
      );
      expect(fixture.fetch).toHaveBeenCalledTimes(1);
      const [before] =
        await sql`SELECT * FROM weather_product WHERE resource='daily:28079'`;
      await sql`UPDATE weather_gate SET next_due_at=now()`;
      await sql`UPDATE weather_product SET next_due_at=now()`;
      fixture.fetch.mockResolvedValue({ notModified: true });
      await refreshWeather("daily:28079", signal());
      const [after] =
        await sql`SELECT * FROM weather_product WHERE resource='daily:28079'`;
      for (const k of ["payload", "version", "issued_at", "fetched_at"])
        expect(after?.[k]).toEqual(before?.[k]);
      expect(after?.issued_at.toISOString()).toBe(daily.ageBasis);
      await sql`UPDATE weather_gate SET next_due_at=now()`;
      await sql`UPDATE weather_product SET next_due_at=now()`;
      fixture.fetch.mockResolvedValue({
        notModified: false,
        payload: { ...daily, name: "Corrected" },
        lastModified: null,
      });
      await refreshWeather("daily:28079", signal());
      expect(
        (await sql`SELECT version FROM weather_product`)[0]?.version,
      ).not.toBe(before?.version);
      await weatherProducts(["forecast:28079"], signal());
      expect(
        (await sql`SELECT count(*)::int n FROM weather_product`)[0]?.n,
      ).toBe(2);
    });
    it("known missing hourly horizon demands daily without repeated hourly acquisition", async () => {
      await sql`INSERT INTO weather_municipality(code,name,boundary,source_version) VALUES('28099','Fixture',ST_Multi(ST_MakeEnvelope(-5,39,-4,40,4326)),'fixture') ON CONFLICT DO NOTHING`;
      const hourly = {
        product: "forecast",
        municipality: "28099",
        name: "Fixture",
        issuedAt: new Date().toISOString(),
        validFrom: "2026-09-30T00:00:00Z",
        validTo: "2026-10-01T00:00:00Z",
        periods: [],
        timeZone: "Europe/Madrid",
        omittedAmbiguousPeriods: 0,
      };
      await sql`INSERT INTO weather_product(resource,payload,issued_at,checked_at,demanded_until,next_due_at) VALUES('forecast:28099',${sql.json(hourly)},now(),now(),now()-interval '1 second',now()+interval '30 minutes')`;
      const r = {
        start: "2026-10-03T10:00:00Z",
        end: "2026-10-03T11:00:00Z",
        legs: [],
      };
      await journeyWeather(
        [r],
        { latitude: 39.5, longitude: -4.5 },
        { latitude: 39.5, longitude: -4.5 },
      );
      await journeyWeather(
        [r],
        { latitude: 39.5, longitude: -4.5 },
        { latitude: 39.5, longitude: -4.5 },
      );
      expect(
        (
          await sql`SELECT demanded_until>now() active FROM weather_product WHERE resource='forecast:28099'`
        )[0]?.active,
      ).toBe(false);
      expect(
        (
          await sql`SELECT demanded_until>now() active FROM weather_product WHERE resource='daily:28099'`
        )[0]?.active,
      ).toBe(true);
      expect(
        fixture.fetch.mock.calls.some(
          ([resource]) => resource === "forecast:28099",
        ),
      ).toBe(false);
    });
    it("five simultaneous consumers share one update, repeated alternatives reuse it", async () => {
      await Promise.all(
        Array.from({ length: 5 }, () =>
          weatherProducts(["warnings:28", "warnings:28"], signal()),
        ),
      );
      expect(fixture.fetch).toHaveBeenCalledTimes(1);
      await weatherProducts(["warnings:28"], signal());
      expect(fixture.fetch).toHaveBeenCalledTimes(1);
      const [r] = await sql`SELECT attempts,payload FROM weather_product`;
      expect(Number(r?.attempts)).toBe(1);
      expect(r?.payload.product).toBe("warnings");
    });
    it("304 changes check time, not publication, fetch time or validity", async () => {
      await weatherProducts(["warnings:28"], signal());
      const [before] = await sql`SELECT * FROM weather_product`;
      await sql`UPDATE weather_product SET next_due_at=now(),checked_at=now()-interval '1 hour'`;
      await sql`UPDATE weather_gate SET next_due_at=now()`;
      fixture.fetch.mockResolvedValue({ notModified: true });
      await refreshWeather("warnings:28", signal());
      const [after] = await sql`SELECT * FROM weather_product`;
      for (const k of [
        "issued_at",
        "fetched_at",
        "valid_from",
        "valid_to",
        "version",
      ])
        expect(after?.[k]).toEqual(before?.[k]);
      expect(after?.error_code).toBeNull();
      expect(after?.checked_at.getTime()).toBeGreaterThanOrEqual(
        before?.checked_at.getTime(),
      );
    });
    it("failed publication preserves the last complete state and Retry-After gates all resources", async () => {
      await weatherProducts(["warnings:28"], signal());
      const [before] = await sql`SELECT payload,version FROM weather_product`;
      await sql`UPDATE weather_product SET next_due_at=now()`;
      await sql`UPDATE weather_gate SET next_due_at=now()`;
      fixture.fetch.mockRejectedValue(new WeatherHttpError(429, 120));
      await refreshWeather("warnings:28", signal());
      const [after] =
        await sql`SELECT *,extract(epoch from next_due_at-now()) AS delay FROM weather_product`;
      expect(after?.payload).toEqual(before?.payload);
      expect(after?.version).toBe(before?.version);
      expect(Number(after?.delay)).toBeGreaterThan(110);
      expect(after?.lease_token).toBeNull();
      await weatherProducts(["forecast:28079"], signal());
      expect(fixture.fetch).toHaveBeenCalledTimes(2);
    });
    it("one worker cycle processes at most one resource and excludes expired demand", async () => {
      await sql`INSERT INTO weather_product(resource,demanded_until) VALUES('warnings:28',now()-interval '1 second'),('forecast:28079',now()+interval '10 minutes'),('forecast:28005',now()+interval '10 minutes')`;
      expect(await weatherWorkerTick()).toBe(true);
      expect(fixture.fetch).toHaveBeenCalledTimes(1);
      await sql`UPDATE weather_product SET demanded_until=now()-interval '1 second'`;
      await sql`UPDATE weather_gate SET next_due_at=now()`;
      expect(await weatherWorkerTick()).toBe(false);
      expect(fixture.fetch).toHaveBeenCalledTimes(1);
    });
    it("inactive window and disabled previews cannot acquire provider leases", async () => {
      await sql`UPDATE ingestion_activity SET active_until=now()-interval '1 second'`;
      await weatherProducts(["warnings:28"], signal());
      expect(fixture.fetch).not.toHaveBeenCalled();
      await sql`UPDATE ingestion_activity SET active_until=now()+interval '30 minutes'`;
      vi.stubEnv("VERCEL", "1");
      await weatherWorkerTick();
      expect(fixture.fetch).not.toHaveBeenCalled();
    });
    it("aborts a cold provider within the shared budget and clears its lease", async () => {
      fixture.fetch.mockImplementation(
        (_r: string, s: AbortSignal) =>
          new Promise((_resolve, reject) =>
            s.addEventListener("abort", () => reject(s.reason), { once: true }),
          ),
      );
      const start = Date.now();
      await weatherProducts(
        ["warnings:28", "forecast:28079"],
        AbortSignal.timeout(120),
      );
      expect(Date.now() - start).toBeLessThan(1000);
      expect(fixture.fetch).toHaveBeenCalledTimes(1);
      const [r] =
        await sql`SELECT lease_token,error_code FROM weather_product WHERE resource='warnings:28'`;
      expect(r?.lease_token).toBeNull();
      expect(r?.error_code).toBeTruthy();
    });
    it("recovers expired leases without accepting a regressing publication", async () => {
      await weatherProducts(["warnings:28"], signal());
      const [before] = await sql`SELECT version FROM weather_product`;
      await sql`UPDATE weather_product SET next_due_at=now(),lease_token=${randomUUID()},lease_until=now()-interval '1 second'`;
      await sql`UPDATE weather_gate SET next_due_at=now(),lease_token=${randomUUID()},lease_until=now()-interval '1 second'`;
      fixture.fetch.mockResolvedValue({
        notModified: false,
        payload: { ...payload(), issuedAt: "2020-01-01T00:00:00Z" },
        lastModified: null,
      });
      await refreshWeather("warnings:28", signal());
      const [r] =
        await sql`SELECT version,error_code,lease_token FROM weather_product`;
      expect(r?.version).toBe(before?.version);
      expect(r?.error_code).toBeTruthy();
      expect(r?.lease_token).toBeNull();
    });
    it("resolves municipality geometry and marks a shared boundary unknown", async () => {
      await sql`INSERT INTO weather_municipality(code,name,boundary,source_version) VALUES('28079','Madrid',ST_Multi(ST_MakeEnvelope(-4,40,-3,41,4326)),'fixture'),('28005','Adjacent',ST_Multi(ST_MakeEnvelope(-3,40,-2,41,4326)),'fixture')`;
      const route = {
        start: new Date().toISOString(),
        end: new Date(Date.now() + 600000).toISOString(),
        legs: [],
      };
      const result = await journeyWeather(
        [route],
        { latitude: 40.5, longitude: -3.5 },
        { latitude: 40.5, longitude: -2.5 },
      );
      expect(result.status).toBe("evaluated");
      expect(result.coverage?.municipalities).toEqual(["28079", "28005"]);
      const boundary = await journeyWeather(
        [route],
        { latitude: 40.5, longitude: -3 },
        { latitude: 40.5, longitude: -8 },
      );
      expect(boundary.coverage?.unknownPoints).toBe(2);
    });
    it("cancels a queued database lookup within the total route budget", async () => {
      const busy = Array.from({ length: 2 }, () =>
        sql`SELECT pg_sleep(3.2)`.execute(),
      );
      await new Promise((r) => setTimeout(r, 50));
      const start = performance.now();
      const r = await journeyWeather(
        [
          {
            start: new Date().toISOString(),
            end: new Date(Date.now() + 60000).toISOString(),
            legs: [],
          },
        ],
        { latitude: 40.5, longitude: -3.5 },
        { latitude: 40.5, longitude: -3.5 },
      );
      expect(r.status).toBe("unavailable");
      expect(performance.now() - start).toBeLessThan(2800);
      await Promise.all(busy);
      expect(
        (await sql`SELECT count(*)::int n FROM weather_product`)[0]?.n,
      ).toBe(0);
    });
  },
);
