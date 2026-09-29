import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  sql: null as ReturnType<typeof postgres> | null,
}));
vi.mock("./database", () => ({ database: () => fixture.sql }));

import {
  accessibilityFrom,
  journeyAccessibility,
  placeAccessibility,
  readAccessibility,
} from "./accessibility";
import { crtmTimetable, resolveCrtm } from "./crtm";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error("Fixture value missing");
  return value;
}
const schema = `access_test_${randomUUID().replaceAll("-", "")}`;
let sql: ReturnType<typeof postgres>,
  admin: ReturnType<typeof postgres>,
  dir: string;
const version = "a".repeat(64),
  release = "b".repeat(64);
const data = {
  manifest: {
    staticVersion: version,
    serviceStart: "20260101",
    serviceEnd: "20261231",
    preparedAt: "2026-01-01T00:00:00Z",
    sources: [{ url: "https://example.invalid/fixture" }],
  },
  stops: [
    {
      stop_id: "parent",
      stop_name: "Same name",
      stop_lat: "40.4",
      stop_lon: "-3.7",
      wheelchair_boarding: "1",
      location_type: "1",
    },
    {
      stop_id: "child",
      stop_name: "Same name",
      stop_lat: "40.4",
      stop_lon: "-3.7",
      wheelchair_boarding: "0",
      location_type: "0",
      parent_station: "parent",
    },
  ],
  routes: [
    { route_id: "route", route_short_name: "C1", route_long_name: "fixture" },
  ],
  trips: [{ trip_id: "trip", route_id: "route", wheelchair_accessible: "2" }],
  stopTimes: [],
};
const ref = (
  entity: "stop" | "trip",
  externalId: string,
  feed = "renfe",
  v = version,
) => ({ feed, version: v, entity, externalId });
let importer: (sql: ReturnType<typeof postgres>, file: string) => Promise<void>,
  backfill: (
    sql: ReturnType<typeof postgres>,
    data: unknown,
    release: string,
  ) => Promise<void>;
describe.skipIf(process.env.RUN_ACCESSIBILITY_DB_TESTS !== "1")(
  "static accessibility PostgreSQL",
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
        connection: { search_path: `${schema},public` },
        onnotice: () => {},
      });
      fixture.sql = sql;
      for (const name of [
        "0001_foundation.sql",
        "0004_local_mobility.sql",
        "0011_trip_destination.sql",
        "0013_emt_catalog_arrivals.sql",
        "0014_crtm_static.sql",
        "0016_routing_releases.sql",
        "0019_static_accessibility.sql",
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
      const imp = new URL("../../../scripts/import-renfe.mjs", import.meta.url)
        .href;
      importer = (await import(imp)).importRenfe;
      const fill = new URL(
        "../../../scripts/renfe-accessibility.mjs",
        import.meta.url,
      ).href;
      backfill = (await import(fill)).backfillRenfeAccessibility;
      dir = await mkdtemp(join(tmpdir(), "mobility-access-"));
      await writeFile(join(dir, "renfe.json"), JSON.stringify(data));
      await importer(sql, join(dir, "renfe.json"));
      await sql`INSERT INTO routing_release(id,manifest,state) VALUES(${release},${sql.json({ feeds: { renfe: { version } } })},'active')`;
      for (const feed of ["light-rail", "emt", "metro"]) {
        await sql`INSERT INTO crtm_feed(dataset_id,version,fetched_at,published_at,imported_at,service_start,service_end,manifest) VALUES(${feed},${version},'2026-01-01','2026-01-01','2026-01-02','2026-01-01',${feed === "metro" ? "2026-05-27" : "2026-12-31"},${sql.json({ sourceUrl: "https://example.invalid/fixture" })})`;
        await sql`INSERT INTO crtm_stops VALUES(${feed},'parent',NULL,'Same name',40.4,-3.7,NULL,1,${feed === "emt" ? 0 : 1}),(${feed},'child',NULL,'Same name',40.4,-3.7,'parent',0,0)`;
        await sql`INSERT INTO crtm_stop_identity(dataset_id,external_id) VALUES(${feed},'parent'),(${feed},'child')`;
        await sql`INSERT INTO crtm_routes VALUES(${feed},'route','agency','ML2','fixture',0)`;
        await sql`INSERT INTO crtm_trips VALUES(${feed},'trip','route','service','destination',0,${feed === "emt" ? 0 : 1})`;
        await sql`INSERT INTO crtm_calendar VALUES(${feed},'service','2026-01-01','2026-12-31',ARRAY[1,2,3,4,5,6,7])`;
        await sql`INSERT INTO crtm_stop_times VALUES(${feed},'trip',1,'child',36000,36000,NULL,0,0,1),(${feed},'trip',2,'parent',36600,36600,NULL,0,0,1)`;
      }
    });
    afterAll(async () => {
      await sql?.end();
      if (admin) {
        await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
        await admin.end();
      }
      if (dir) await rm(dir, { recursive: true, force: true });
    });
    it("backfills only attributes, retaining identities/manifest/version, and is idempotent", async () => {
      const before =
        await sql`SELECT id,name,updated_at FROM canonical_place ORDER BY id`;
      const feed = await sql`SELECT * FROM static_feed`;
      await sql`UPDATE place_external_identifier SET wheelchair_code=NULL,location_type=NULL,parent_station=NULL,accessibility_imported_at=NULL WHERE source_id='renfe'`;
      await sql`UPDATE transit_trip SET wheelchair_code=NULL,source_version=NULL,accessibility_imported_at=NULL WHERE source_id='renfe'`;
      await backfill(sql, data, release);
      const once =
        await sql`SELECT * FROM place_external_identifier ORDER BY external_id`;
      await backfill(sql, data, release);
      expect(
        await sql`SELECT * FROM place_external_identifier ORDER BY external_id`,
      ).toEqual(once);
      expect(await sql`SELECT * FROM static_feed`).toEqual(feed);
      expect(
        await sql`SELECT id,name,updated_at FROM canonical_place ORDER BY id`,
      ).toEqual(before);
      const refs = [ref("stop", "child"), ref("trip", "trip")],
        results = await readAccessibility(refs);
      expect(accessibilityFrom(results, required(refs[0])).status).toBe(
        "declared_accessible",
      );
      expect(accessibilityFrom(results, required(refs[1])).status).toBe(
        "declared_not_accessible",
      );
    });
    it("rejects another version and rolls back earlier updates when a trip identity is invalid", async () => {
      await expect(
        backfill(
          sql,
          {
            ...data,
            manifest: { ...data.manifest, staticVersion: "c".repeat(64) },
          },
          release,
        ),
      ).rejects.toThrow();
      const invalid = structuredClone(data);
      required(invalid.stops[0]).wheelchair_boarding = "2";
      required(invalid.trips[0]).trip_id = "missing";
      await expect(backfill(sql, invalid, release)).rejects.toThrow();
      const r = ref("stop", "parent");
      expect(accessibilityFrom(await readAccessibility([r]), r).status).toBe(
        "declared_accessible",
      );
    });
    it("future import clears old declarations and rollback imports original attributes without replacing UUIDs", async () => {
      const ids =
        await sql`SELECT external_id,place_id FROM place_external_identifier ORDER BY external_id`;
      const next = structuredClone(data);
      next.manifest.staticVersion = "c".repeat(64);
      for (const s of next.stops) s.wheelchair_boarding = "";
      required(next.trips[0]).wheelchair_accessible = "";
      await writeFile(join(dir, "next.json"), JSON.stringify(next));
      await importer(sql, join(dir, "next.json"));
      const r = ref("trip", "trip", "renfe", next.manifest.staticVersion);
      expect(accessibilityFrom(await readAccessibility([r]), r).status).toBe(
        "unknown",
      );
      const old = ref("stop", "parent");
      expect(
        accessibilityFrom(await readAccessibility([old]), old).status,
      ).toBe("unknown");
      await importer(sql, join(dir, "renfe.json"));
      expect(
        await sql`SELECT external_id,place_id FROM place_external_identifier ORDER BY external_id`,
      ).toEqual(ids);
    });
    it("reads CRTM inheritance and actual boarding point, retaining existing codes", async () => {
      const r = await resolveCrtm("parent", 5, "light-rail");
      const p = required(r.places[0]);
      expect(p.accessibility.status).toBe("declared_accessible");
      const t = await crtmTimetable({
        placeId: p.id,
        serviceDate: "2026-09-29",
        afterTime: "09:00:00",
        limit: 5,
      });
      expect(t.status).toBe("available");
      if (!("departures" in t)) throw Error("departures missing");
      expect(t.departures[0]?.stopId).toBe("child");
      expect(
        t.departures[0]?.accessibility.boarding.inheritedFrom?.externalId,
      ).toBe("parent");
      expect(t.departures[0]?.wheelchairAccessibleCode).toBe(1);
      const metro = await resolveCrtm("parent", 5, "metro");
      expect(
        metro.places[0]?.accessibility.provenance?.currentServiceEnvelope,
      ).toBe(false);
    });
    it("leaves EMT without attributes unknown, including verified API-to-GTFS correspondence", async () => {
      const [p] = await sql`SELECT id FROM canonical_place LIMIT 1`;
      await sql`INSERT INTO routing_place_link VALUES(${required(p).id},'emt','child',${version},'fixture_verified',0)`;
      const result = await placeAccessibility([
        {
          id: required(p).id,
          identifiers: [
            { source: "emt", externalId: "72", sourceVersion: "api" },
          ],
        },
      ]);
      expect(result.get(required(p).id)?.status).toBe("unknown");
      expect(result.get(required(p).id)?.feed).toBe("emt");
    });
    it("keeps ML2 codes with scoped discrepancy and independent vehicle evidence", async () => {
      const ml =
        "7e49cfc0980c8e61d96a258d1076ec410a26f66767586d1b1dea49b9caa39467";
      await sql`UPDATE crtm_feed SET version=${ml} WHERE dataset_id='light-rail'`;
      await sql`UPDATE crtm_stops SET wheelchair=2 WHERE dataset_id='light-rail' AND external_id='child'`;
      const r = ref("stop", "child", "light-rail", ml);
      const result = accessibilityFrom(await readAccessibility([r]), r);
      expect(result.normalizedCode).toBe(2);
      expect(result.qualityNotes[0]?.lines).toEqual(["ML2"]);
      const context = await journeyAccessibility(
        [
          {
            legs: [
              {
                mode: "RAIL",
                from: { stop: { gtfsId: "light-rail:child" } },
                to: { stop: { gtfsId: "light-rail:parent" } },
                trip: { gtfsId: "light-rail:trip" },
              },
              { mode: "WALK", from: {}, to: {} },
            ],
          },
        ],
        { "light-rail": ml },
      );
      expect(context.accessibilityGuaranteed).toBe(false);
      expect(context.declaredBarriers).toHaveLength(1);
      expect(context.unverified).toContain(
        "internal_connections_and_transfers",
      );
    });
    it("isolates a failed accessibility query with a savepoint inside an existing catalog transaction", async () => {
      await sql.begin(async (tx) => {
        await tx`ALTER TABLE transit_trip RENAME COLUMN wheelchair_code TO temporarily_missing`;
        const r = ref("stop", "parent");
        const result = accessibilityFrom(await readAccessibility([r], tx), r);
        expect(result.reason).toBe("accessibility_storage_unavailable");
        expect((await tx`SELECT 1 AS n`)[0]?.n).toBe(1);
        await tx`ALTER TABLE transit_trip RENAME COLUMN temporarily_missing TO wheelchair_code`;
      });
    });
  },
);
