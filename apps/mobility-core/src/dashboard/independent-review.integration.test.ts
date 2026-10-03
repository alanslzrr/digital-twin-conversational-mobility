import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  sql: null as ReturnType<typeof postgres> | null,
}));
vi.mock("../database", () => ({ database: () => fixture.sql }));

import { readEntities } from "./entities";
import { readOverview } from "./overview";

const schema = `dashboard_regression_${randomUUID().replaceAll("-", "")}`;
const owner = randomUUID();
let admin: ReturnType<typeof postgres>, sql: ReturnType<typeof postgres>;
describe.skipIf(process.env.RUN_DASHBOARD_DB_TESTS !== "1")(
  "independent audit regressions in isolated PostgreSQL",
  () => {
    beforeAll(async () => {
      const url = process.env.DATABASE_URL;
      if (
        !url ||
        !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
      )
        throw Error("Local DB required");
      admin = postgres(url, { max: 1, onnotice: () => {} });
      await admin.unsafe(`CREATE SCHEMA ${schema}`);
      sql = postgres(url, {
        max: 4,
        connection: { search_path: `${schema},public` },
        onnotice: () => {},
      });
      fixture.sql = sql;
      const directory = new URL(
        "../../../../infra/postgres/migrations/",
        import.meta.url,
      );
      for (const name of (await readdir(directory))
        .filter((n) => n.endsWith(".sql"))
        .sort())
        await sql.unsafe(await readFile(new URL(name, directory), "utf8"));
      process.env.MOBILITY_MCP_SECRET = "synthetic-regression-cursor-secret";
    }, 20000);
    afterAll(async () => {
      await sql?.end();
      if (admin) {
        await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });
    it("keeps DGT published nested coordinates in the viewport result", async () => {
      await sql`UPDATE source_catalog SET enabled=true WHERE id='dgt'`;
      const at = new Date().toISOString();
      await sql`INSERT INTO mobility_snapshot(job_id,source_id,observed_at,ingested_at,quality,raw_reference,payload)
      VALUES('dgt-incidents','dgt',${at},${at},'provisional','synthetic independent map audit',${sql.json({ incidents: [{ id: "audit-dgt", title: "Synthetic audit", location: { type: "point", start: { latitude: 40.4, longitude: -3.7 }, end: null } }] })})`;
      const selection = { category: "incidents", product: "dgt-incidents" };
      const list = await readEntities(selection, owner);
      expect(list.entities[0]).toMatchObject({
        latitude: 40.4,
        longitude: -3.7,
      });
      const map = await readEntities(
        { ...selection, bbox: [-4, 40, -3, 41] },
        owner,
        true,
      );

      expect(map.entities).toHaveLength(1);
      expect(map.totals?.total).toBe(1);
      const outside = await readEntities(
        { ...selection, bbox: [-4, 41, -3, 42] },
        owner,
        true,
      );
      expect(outside.entities).toHaveLength(0);
      expect(outside.totals?.total).toBe(0);
    });
    it("does not describe a never-requested EMT cache as an old reading", async () => {
      await sql`UPDATE source_catalog SET enabled=true WHERE id='emt'`;
      await sql`DELETE FROM emt_arrival_cache`;
      const overview = await readOverview(new URLSearchParams());
      const arrivals = overview.products.find((p) => p.id === "emt:arrivals");

      expect(arrivals?.issue).toContain("Sin consulta previa");
    });
    it("keeps M3 unavailable when all incident products are disabled", async () => {
      await sql`UPDATE source_catalog SET enabled=false`;
      const overview = await readOverview(new URLSearchParams());
      const metric = overview.metrics.find((m) => m.id === "M3");

      expect(metric?.value).toBeNull();
    });

    it("distinguishes pending, empty recent and stale EMT resources", async () => {
      await sql`UPDATE source_catalog SET enabled=true WHERE id='emt'`;
      await sql`INSERT INTO emt_arrival_cache(stop_id) VALUES('pending')`;
      const arrivals = async () =>
        (await readOverview(new URLSearchParams())).products.find(
          (p) => p.id === "emt:arrivals",
        );
      expect(await arrivals()).toMatchObject({
        total: 0,
        observedAt: null,
        usable: false,
        issue: expect.stringContaining("Sin consulta previa"),
      });
      await sql`UPDATE emt_arrival_cache SET observed_at=now(),ingested_at=now(),payload='[]'::jsonb WHERE stop_id='pending'`;
      expect(await arrivals()).toMatchObject({
        total: 1,
        usable: true,
        issue: null,
      });
      await sql`UPDATE emt_arrival_cache SET observed_at=now()-interval '5 minutes' WHERE stop_id='pending'`;
      expect(await arrivals()).toMatchObject({
        total: 1,
        usable: false,
        issue: expect.stringContaining("La última lectura"),
      });
    });
    it("retains one parking category in metric, list and detail queries", async () => {
      await sql`UPDATE source_catalog SET enabled=true WHERE id='madrid-parking'`;
      const at = new Date().toISOString();
      await sql`INSERT INTO mobility_snapshot(job_id,source_id,observed_at,ingested_at,quality,raw_reference,payload) VALUES('madrid-parking','madrid-parking',${at},${at},'provisional','synthetic regression',${sql.json(
        {
          parkings: [
            {
              id: "regression-parking",
              name: "Synthetic",
              availability: [
                {
                  category: "a",
                  name: "Public A",
                  freeSpaces: 3,
                  observedAt: at,
                },
                {
                  category: "b",
                  name: "Public B",
                  freeSpaces: 2,
                  observedAt: at,
                },
              ],
            },
          ],
        },
      )})`;
      const overview = await readOverview(
        new URLSearchParams({ parkingCategory: "b" }),
      );
      expect(overview.parkingCategory).toBe("b");
      expect(overview.metrics.find((m) => m.id === "M2")).toMatchObject({
        value: 2,
        detailHref: expect.stringContaining("parkingCategory=b"),
        definition: expect.stringContaining("Public B"),
      });
      const list = await readEntities(
        { category: "parking", parkingCategory: "b", limit: 1 },
        owner,
      );
      expect(list.totals?.total).toBe(1);
      expect(list.entities[0]?.id).toBe("regression-parking:b");
      expect(
        (
          await readEntities(
            { category: "parking", parkingCategory: "b" },
            owner,
            false,
            "regression-parking:b",
          )
        ).entities,
      ).toHaveLength(1);
    });
  },
);
