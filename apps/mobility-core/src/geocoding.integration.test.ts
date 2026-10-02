import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  sql: null as ReturnType<typeof postgres> | null,
  local: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("./database", () => ({ database: () => fixture.sql }));
vi.mock("./mobility", () => ({ resolvePlace: fixture.local }));
vi.mock("./adapters/geocoder", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchGeocodes: fixture.fetch,
}));

import { resolveAddress } from "./geocoding";

let sql: ReturnType<typeof postgres>, admin: ReturnType<typeof postgres>;
const schema = `geocoder_${randomUUID().replaceAll("-", "")}`;
describe.skipIf(process.env.RUN_GEOCODE_DB_TESTS !== "1")(
  "geocoding cache and shared gate",
  () => {
    beforeAll(async () => {
      const url = process.env.DATABASE_URL;
      if (
        !url ||
        !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
      )
        throw Error("Local only");
      admin = postgres(url, { max: 1, onnotice: () => {} });
      await admin.unsafe(`CREATE SCHEMA ${schema}`);
      sql = postgres(url, {
        max: 4,
        connection: { search_path: `${schema},public` },
        onnotice: () => {},
      });
      fixture.sql = sql;
      for (const file of ["0001_foundation.sql", "0015_geocoding.sql"])
        await sql.unsafe(
          await readFile(
            new URL(
              `../../../infra/postgres/migrations/${file}`,
              import.meta.url,
            ),
            "utf8",
          ),
        );
      vi.stubEnv("GEOCODER_ENABLED", "true");
      vi.stubEnv("GEOCODER_URL", "http://127.0.0.1:9999/search");
      vi.stubEnv("GEOCODER_USER_AGENT", "Local-test-fixture/1");
      fixture.local.mockResolvedValue({ places: [], status: "not_found" });
      fixture.fetch.mockResolvedValue([
        {
          externalId: "way:72",
          name: "Museo Madrid",
          latitude: 40.4,
          longitude: -3.7,
          precision: "building",
          sourceUrl: "https://www.openstreetmap.org/way/72",
        },
      ]);
    });
    afterAll(async () => {
      vi.unstubAllEnvs();
      await sql?.end();
      if (admin) {
        await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });
    it("uses catalogs without provider calls and requires external consent", async () => {
      fixture.local.mockResolvedValueOnce({
        places: [{ id: "known" }],
        status: "found",
      });
      expect(await resolveAddress("Atocha", true)).toMatchObject({
        basis: "local_catalog",
      });
      expect(fixture.fetch).not.toHaveBeenCalled();
      expect(await resolveAddress("Museo", false)).toMatchObject({
        status: "confirmation_required",
      });
    });
    it("persists candidate identity and reuses normalized queries without network", async () => {
      const first = await resolveAddress("Museo Madrid", true);
      expect(first).toMatchObject({
        status: "found",
        cached: false,
        requiresConfirmation: true,
      });
      const second = await resolveAddress(" MUSEO   MADRID ", false);
      expect(second).toMatchObject({ status: "found", cached: true });
      expect(fixture.fetch).toHaveBeenCalledTimes(1);
      expect("places" in first && first.places).toEqual(
        "places" in second && second.places,
      );
    });
    it("serializes unrelated misses, including concurrent calls", async () => {
      await sql`UPDATE geocode_gate SET next_due_at=now()`;
      const before = fixture.fetch.mock.calls.length;
      const results = await Promise.all([
        resolveAddress("Museo uno", true),
        resolveAddress("Museo dos", true),
      ]);
      expect(fixture.fetch.mock.calls.length - before).toBe(1);
      expect(
        results.some(
          (r) => "reason" in r && r.reason === "geocoder_busy_or_backoff",
        ),
      ).toBe(true);
    });
    it("keeps provider errors distinct from negative cache and applies backoff", async () => {
      await sql`UPDATE geocode_gate SET next_due_at=now()`;
      fixture.fetch.mockRejectedValueOnce(new Error("upstream_http_429"));
      expect(await resolveAddress("Museo tres", true)).toMatchObject({
        status: "unavailable",
        reason: "upstream_http_429",
      });
      expect(await resolveAddress("Museo cuatro", true)).toMatchObject({
        reason: "geocoder_busy_or_backoff",
      });
      const [count] = await sql`SELECT count(*)::int AS n FROM geocode_cache`;
      expect(count?.n).toBe(2);
    });
  },
);

// Observer writes are tested separately with their own isolated pool/schema.
vi.mock("./observability/events", () => ({
  recordOperationalEvent: vi.fn(async () => {}),
}));
vi.mock("./observability/retention", () => ({
  pruneObservability: vi.fn(async () => {}),
}));
