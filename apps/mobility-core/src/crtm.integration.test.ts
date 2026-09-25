import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  sql: null as ReturnType<typeof postgres> | null,
}));
vi.mock("./database", () => ({ database: () => fixture.sql }));

import { crtmTimetable, resolveCrtm } from "./crtm";

const schema = `crtm_query_${randomUUID().replaceAll("-", "")}`;
let admin: ReturnType<typeof postgres>, sql: ReturnType<typeof postgres>;
let stop: string, station: string;
describe.skipIf(process.env.RUN_CRTM_DB_TESTS !== "1")(
  "CRTM queries in isolated PostgreSQL",
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
      await sql.unsafe(
        await readFile(
          new URL(
            "../../../infra/postgres/migrations/0014_crtm_static.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      for (const network of ["metro", "light-rail", "interurban"]) {
        await sql`INSERT INTO crtm_feed VALUES(${network},'v1','2026-09-20','2026-09-19',now(),'2026-01-01','2026-12-31',${sql.json({ sourceUrl: "https://example.invalid/fixture", termsUrl: "fixture", attribution: "fixture" })})`;
        await sql`INSERT INTO crtm_stops VALUES(${network},'station','S','Intercambiador',40.4,-3.7,null,1,0),
        (${network},'stop','0072','Andén circular',40.4,-3.7,'station',0,1)`;
        await sql`INSERT INTO crtm_stop_identity(dataset_id,external_id) SELECT dataset_id,external_id FROM crtm_stops WHERE dataset_id=${network}`;
        await sql`INSERT INTO crtm_routes VALUES(${network},'route','CRTM','001','Circular',3)`;
        await sql`INSERT INTO crtm_trips VALUES(${network},'trip','route','service',null,0,1)`;
        await sql`INSERT INTO crtm_calendar VALUES(${network},'service','2026-01-01','2026-12-31',ARRAY[5])`;
        await sql`INSERT INTO crtm_stop_times VALUES
        (${network},'trip',1,'stop',36000,36000,null,0,0,1),
        (${network},'trip',2,'stop',36600,36600,'Destino publicado',0,0,0),
        (${network},'trip',3,'stop',90000,90000,null,0,0,1),
        (${network},'trip',4,'stop',93600,93600,'Terminal',0,0,1)`;
      }
      const resolved = await resolveCrtm("0072", 5, "light-rail");
      const first = resolved.places[0];
      if (!first) throw Error("Missing test stop");
      stop = first.id;
      const parent = (await resolveCrtm("station", 5, "light-rail")).places[0];
      if (!parent) throw Error("Missing test station");
      station = parent.id;
    });
    afterAll(async () => {
      await sql?.end();
      if (admin) {
        await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });
    it("keeps network identities, exact stop codes and published correspondences", async () => {
      const all = await resolveCrtm("0072", 5);
      expect(all.ambiguous).toBe(true);
      expect(new Set(all.places.map((p) => p.id)).size).toBe(3);
      expect(all.places[0]?.correspondences).toHaveLength(3);
      expect((await resolveCrtm("%", 5)).places).toHaveLength(0);
      await sql`UPDATE crtm_stops SET latitude=41 WHERE dataset_id='metro' AND external_id='station'`;
      expect(
        (await resolveCrtm("0072", 5, "light-rail")).places[0]?.correspondences,
      ).toHaveLength(2);
      await sql`UPDATE crtm_stops SET latitude=40.4 WHERE dataset_id='metro' AND external_id='station'`;
    });
    it("preserves repeated visits and >24h but excludes the terminal visit even with pickup=0", async () => {
      const result = await crtmTimetable({
        placeId: station,
        serviceDate: "2026-09-25",
        afterTime: "00:00:00",
        limit: 10,
      });
      expect(result).toMatchObject({
        status: "available",
        truncated: false,
        departures: [
          {
            stopSequence: 1,
            destination: null,
            destinationEvidence: "unknown",
            kind: "scheduled",
          },
          { stopSequence: 2, destination: "Destino publicado", timepoint: 0 },
          {
            stopSequence: 3,
            serviceTime: "25:00:00",
            departureTime: "2026-09-25T23:00:00.000Z",
          },
        ],
      });
    });
    it("applies service calendars and add/remove exception precedence", async () => {
      expect(
        await crtmTimetable({
          placeId: stop,
          serviceDate: "2026-09-26",
          limit: 10,
        }),
      ).toMatchObject({ departures: [] });
      await sql`INSERT INTO crtm_exceptions VALUES('light-rail','service','2026-09-26',1),('light-rail','service','2026-09-25',2)`;
      expect(
        await crtmTimetable({
          placeId: stop,
          serviceDate: "2026-09-26",
          limit: 10,
        }),
      ).toMatchObject({ departures: expect.any(Array) });
      const added = await crtmTimetable({
        placeId: stop,
        serviceDate: "2026-09-26",
        limit: 10,
      });
      expect("departures" in added && added.departures).toHaveLength(3);
      expect(
        await crtmTimetable({
          placeId: stop,
          serviceDate: "2026-09-25",
          afterTime: "00:00:00",
          limit: 10,
        }),
      ).toMatchObject({ departures: [] });
      await sql`DELETE FROM crtm_exceptions`;
    });
    it("returns frequency windows with each repeated stop offset, never individual departures", async () => {
      await sql`INSERT INTO crtm_frequencies VALUES('light-rail','trip',36000,39600,600,0)`;
      const result = await crtmTimetable({
        placeId: stop,
        serviceDate: "2026-09-25",
        afterTime: "10:30:00",
        limit: 10,
      });
      expect(result).toMatchObject({
        departures: [
          {
            kind: "frequency_window",
            startServiceTime: "10:00:00",
            endServiceTimeExclusive: "11:00:00",
            exactTimes: 0,
          },
          {
            kind: "frequency_window",
            startServiceTime: "10:10:00",
            endServiceTimeExclusive: "11:10:00",
            exactTimes: 0,
          },
          {
            kind: "frequency_window",
            startServiceTime: "25:00:00",
            endServiceTimeExclusive: "26:00:00",
            exactTimes: 0,
          },
        ],
      });
      await sql`DELETE FROM crtm_frequencies`;
    });
    it("supports exception-only services, exclusive frequency ends and bounded results", async () => {
      await sql`DELETE FROM crtm_calendar WHERE dataset_id='light-rail'`;
      await sql`INSERT INTO crtm_exceptions VALUES('light-rail','service','2026-09-26',1)`;
      const result = await crtmTimetable({
        placeId: stop,
        serviceDate: "2026-09-26",
        afterTime: "00:00:00",
        limit: 1,
      });
      expect(result).toMatchObject({ status: "available", truncated: true });
      expect("departures" in result && result.departures).toHaveLength(1);
      await sql`INSERT INTO crtm_frequencies VALUES('light-rail','trip',36000,39600,600,1)`;
      const ended = await crtmTimetable({
        placeId: stop,
        serviceDate: "2026-09-26",
        afterTime: "26:00:00",
        limit: 10,
      });
      expect(ended).toMatchObject({ departures: [] });
      const exact = await crtmTimetable({
        placeId: stop,
        serviceDate: "2026-09-26",
        afterTime: "00:00:00",
        limit: 1,
      });
      expect(exact).toMatchObject({
        departures: [{ kind: "frequency_window", exactTimes: 1 }],
      });
      await sql`DELETE FROM crtm_frequencies`;
      await sql`DELETE FROM crtm_exceptions`;
      await sql`INSERT INTO crtm_calendar VALUES('light-rail','service','2026-01-01','2026-12-31',ARRAY[5])`;
    });
    it("rejects dates outside coverage and unknown IDs rather than claiming no service", async () => {
      expect(
        await crtmTimetable({
          placeId: stop,
          serviceDate: "2027-01-01",
          limit: 5,
        }),
      ).toMatchObject({
        status: "unavailable",
        reason: "outside_static_service_period",
      });
      expect(
        await crtmTimetable({ placeId: randomUUID(), limit: 5 }),
      ).toMatchObject({ reason: "current_crtm_place_required" });
    });
  },
);
