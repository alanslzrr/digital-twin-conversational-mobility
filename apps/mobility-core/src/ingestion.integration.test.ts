import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  weather: vi.fn(),
  emt: vi.fn(),
}));
vi.mock("./database", () => ({ database: () => fixture.sql }));
vi.mock("./adapters/aemet", () => ({ fetchWeather: fixture.weather }));
vi.mock("./adapters/emt", () => ({ fetchEmtIncidents: fixture.emt }));

import { history } from "./history";
import { ingest, tick } from "./ingestion";

const schema = `e3_test_${randomUUID().replaceAll("-", "")}`;
let admin: ReturnType<typeof postgres>;
let sql: ReturnType<typeof postgres>;
let directory: string;
const observation = new Date().toISOString();
const weather = {
  raw: '{"fixture":"weather"}',
  observedAt: observation,
  readings: [],
};

describe.skipIf(process.env.RUN_INGESTION_DB_TESTS !== "1")(
  "ingestion recovery in isolated local schema",
  () => {
    beforeAll(async () => {
      const url = process.env.DATABASE_URL;
      if (
        !url ||
        !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
      )
        throw new Error("Explicit local database required");
      admin = postgres(url, { max: 1, onnotice: () => {} });
      await admin.unsafe(`CREATE SCHEMA ${schema}`);
      sql = postgres(url, {
        max: 4,
        connection: { search_path: `${schema},public` },
        onnotice: () => {},
      });
      fixture.sql = sql;
      directory = await mkdtemp(join(tmpdir(), "mobility-e3-"));
      vi.stubEnv("LOCAL_DATA_DIR", directory);
      vi.stubEnv("INGESTION_ENABLED", "true");
      vi.stubEnv("VERCEL", "");
      for (const name of [
        "0001_foundation.sql",
        "0004_local_mobility.sql",
        "0005_parking_job.sql",
        "0006_weather_job.sql",
        "0007_emt_alerts.sql",
        "0010_ingestion_continuity.sql",
        "0012_history_revisions.sql",
        "0017_dgt_incidents.sql",
      ]) {
        if (name === "0012_history_revisions.sql")
          await sql`INSERT INTO mobility_history(job_id,observed_at,ingested_at,quality,raw_reference,payload)
            VALUES ('aemet',${new Date(observation)},${new Date(observation)},'provisional','legacy',${sql.json({ staticVersion: "legacy-feed" })})`;
        await sql.unsafe(
          await readFile(
            new URL(
              `../../../infra/postgres/migrations/${name}`,
              import.meta.url,
            ),
            "utf8",
          ),
        );
        if (name === "0012_history_revisions.sql") {
          const [legacy] =
            await sql`SELECT * FROM mobility_history WHERE raw_reference='legacy'`;
          expect(legacy?.parser_version).toBeNull();
          expect(legacy?.static_version).toBe("legacy-feed");
          expect(new Date(legacy?.ingested_at).toISOString()).toBe(observation);
        }
      }
    });
    afterAll(async () => {
      await sql?.end();
      if (admin) {
        await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
      if (directory) await rm(directory, { recursive: true, force: true });
      vi.unstubAllEnvs();
    });
    beforeEach(async () => {
      fixture.weather.mockReset().mockResolvedValue(weather);
      fixture.emt.mockReset().mockResolvedValue({
        raw: '{"fixture":"emt"}',
        observedAt: observation,
        alerts: [],
      });
      await sql`TRUNCATE mobility_snapshot,mobility_history,raw_batch,dgt_incident`;
      await sql`UPDATE ingestion_job SET next_due_at=now()+interval '1 day',lease_token=NULL,lease_until=NULL,failures=0,error_code=NULL,attempts=0,recovered_leases=0,last_attempt_at=NULL`;
      await sql`UPDATE source_catalog SET enabled=true`;
      await sql`UPDATE ingestion_activity SET active_until=now()+interval '30 minutes'`;
      await sql`UPDATE ingestion_worker SET last_seen_at=NULL,last_pruned_at=now()`;
    });
    it("publishes DGT corrections and withdrawals without duplicating retries or regressing current state", async () => {
      const original = await readFile(
        new URL("./adapters/fixtures/dgt-public-excerpt.xml", import.meta.url),
        "utf8",
      );
      const base = Date.now() - 60000;
      const publication = (xml: string, time: number) =>
        xml.replace(
          /<com:publicationTime>[^<]+/,
          `<com:publicationTime>${new Date(time).toISOString()}`,
        );
      let body = publication(original, base);
      const fetchMock = vi.fn(async () => new Response(body));
      vi.stubGlobal("fetch", fetchMock);
      const run = async () => {
        await sql`UPDATE ingestion_job SET next_due_at=now()-interval '1 second' WHERE id='dgt-incidents'`;
        return ingest("dgt-incidents");
      };
      try {
        expect(await run()).toMatchObject({ status: "healthy" });
        expect(await run()).toMatchObject({ status: "healthy" });
        expect(await sql`SELECT * FROM mobility_history`).toHaveLength(1);
        expect(
          await sql`SELECT * FROM dgt_incident WHERE withdrawn_at IS NULL`,
        ).toHaveLength(2);
        body = body
          .replace('version="2"', 'version="3"')
          .replace("N-400", "N-401");
        await run();
        expect(await sql`SELECT * FROM mobility_history`).toHaveLength(2);
        expect(
          (
            await sql`SELECT payload FROM dgt_incident WHERE id='2816645:18811074'`
          )[0]?.payload.road,
        ).toBe("N-401");
        body = publication(
          original.replace(/<sit:situation\b[\s\S]*?<\/sit:situation>/g, ""),
          base + 1000,
        );
        await run();
        expect(
          await sql`SELECT * FROM dgt_incident WHERE withdrawn_at IS NOT NULL`,
        ).toHaveLength(2);
        const at = new Date().toISOString();
        expect(await history("dgt", at, "knowledge")).toMatchObject({
          status: "available",
        });
        body = publication(original, base - 1000);
        expect(await run()).toMatchObject({ status: "historical_only" });
        expect(
          await sql`SELECT * FROM dgt_incident WHERE withdrawn_at IS NOT NULL`,
        ).toHaveLength(2);
        body = publication(original, base + 2000);
        await run();
        expect(
          await sql`SELECT * FROM dgt_incident WHERE withdrawn_at IS NULL`,
        ).toHaveLength(2);
        body = "<broken>";
        expect(await run()).toMatchObject({ status: "error" });
        expect(
          await sql`SELECT * FROM dgt_incident WHERE withdrawn_at IS NULL`,
        ).toHaveLength(2);
      } finally {
        vi.unstubAllGlobals();
      }
    });
    it("allows another lane to complete while a provider remains pending", async () => {
      let release!: () => void;
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      fixture.weather.mockImplementation(async () => {
        entered();
        await blocked;
        return weather;
      });
      await sql`UPDATE ingestion_job SET next_due_at=now()-interval '2 minutes' WHERE id='aemet'`;
      await sql`UPDATE ingestion_job SET next_due_at=now()-interval '1 minute' WHERE id='emt-alerts'`;
      const slow = tick("0");
      await started;
      try {
        const fast = await tick("1");
        expect(fast).toMatchObject({
          results: [{ job: "emt-alerts", status: "healthy" }],
        });
        expect(await sql`SELECT job_id FROM mobility_snapshot`).toHaveLength(1);
      } finally {
        release();
        await slow;
      }
    });
    it("claims one due attempt under concurrent read-through and recovers an expired lease", async () => {
      await sql`UPDATE ingestion_job SET next_due_at=now()-interval '3 hours',lease_token=${randomUUID()},lease_until=now()-interval '1 second' WHERE id='aemet'`;
      await Promise.all([ingest("aemet"), ingest("aemet")]);
      expect(fixture.weather).toHaveBeenCalledTimes(1);
      const [job] =
        await sql`SELECT *,next_due_at>now() AS scheduled FROM ingestion_job WHERE id='aemet'`;
      expect(job).toMatchObject({
        attempts: "1",
        recovered_leases: "1",
        lease_token: null,
        scheduled: true,
      });
      expect(await sql`SELECT * FROM mobility_history`).toHaveLength(1);
      await tick("1");
      expect(fixture.weather).toHaveBeenCalledTimes(1); // no catch-up replay
    });
    it("keeps heartbeat without fetching or extending an inactive window", async () => {
      await sql`UPDATE ingestion_activity SET active_until=now()-interval '1 hour'`;
      await sql`UPDATE ingestion_job SET next_due_at=now()-interval '1 hour'`;
      expect(await tick("1")).toEqual({ status: "idle" });
      expect(fixture.weather).not.toHaveBeenCalled();
      const [row] =
        await sql`SELECT active_until<now() AS inactive,last_seen_at IS NOT NULL AS heartbeat FROM ingestion_activity CROSS JOIN ingestion_worker WHERE id='1'`;
      expect(row).toEqual({ inactive: true, heartbeat: true });
    });
    it("backs off network failure then recovers without duplicate history", async () => {
      await sql`UPDATE ingestion_job SET next_due_at=now() WHERE id='aemet'`;
      fixture.weather.mockRejectedValueOnce(
        new TypeError("secret upstream detail"),
      );
      expect(await ingest("aemet")).toMatchObject({
        status: "error",
        error: "upstream_network_error",
      });
      expect(await ingest("aemet")).toMatchObject({
        status: "not_due_or_inactive",
      });
      await sql`UPDATE ingestion_job SET next_due_at=now() WHERE id='aemet'`;
      expect(await ingest("aemet")).toMatchObject({ status: "healthy" });
      await sql`UPDATE ingestion_job SET next_due_at=now() WHERE id='aemet'`;
      await ingest("aemet");
      expect(await sql`SELECT * FROM mobility_history`).toHaveLength(1);
      expect(await sql`SELECT * FROM raw_batch`).toHaveLength(1);
      const [job] =
        await sql`SELECT failures,error_code FROM ingestion_job WHERE id='aemet'`;
      expect(job).toEqual({ failures: 0, error_code: null });
    });
    it.each([false, true])(
      "rejects expired lease completion, failure=%s",
      async (failure) => {
        await sql`UPDATE ingestion_job SET next_due_at=now() WHERE id='aemet'`;
        fixture.weather.mockImplementationOnce(async () => {
          await sql`UPDATE ingestion_job SET lease_until=now()-interval '1 second' WHERE id='aemet'`;
          if (failure) throw new TypeError("network");
          return weather;
        });
        expect(await ingest("aemet")).toMatchObject({ status: "lease_lost" });
        expect(await sql`SELECT * FROM mobility_snapshot`).toHaveLength(0);
        const [job] =
          await sql`SELECT failures FROM ingestion_job WHERE id='aemet'`;
        expect(job?.failures).toBe(0);
        expect(await ingest("aemet")).toMatchObject({ status: "healthy" });
      },
    );
    it("recovers a raw-storage failure without publishing a snapshot", async () => {
      const file = join(directory, "not-a-directory");
      await writeFile(file, "fixture");
      await sql`UPDATE ingestion_job SET next_due_at=now() WHERE id='aemet'`;
      vi.stubEnv("LOCAL_DATA_DIR", file);
      try {
        expect(await ingest("aemet")).toMatchObject({
          status: "error",
          error: "ingestion_storage_error",
        });
        expect(await sql`SELECT * FROM mobility_snapshot`).toHaveLength(0);
        const [failed] =
          await sql`SELECT error_stage,last_finished_at IS NOT NULL AS finished FROM ingestion_job WHERE id='aemet'`;
        expect(failed).toEqual({ error_stage: "raw_storage", finished: true });
      } finally {
        vi.stubEnv("LOCAL_DATA_DIR", directory);
      }
      await sql`UPDATE ingestion_job SET next_due_at=now() WHERE id='aemet'`;
      expect(await ingest("aemet")).toMatchObject({ status: "healthy" });
    });
    it("rolls back interrupted publication and retries idempotently", async () => {
      await sql.unsafe(
        `CREATE FUNCTION reject_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private storage detail'; END $$`,
      );
      await sql.unsafe(
        `CREATE TRIGGER reject_snapshot BEFORE INSERT ON mobility_snapshot FOR EACH ROW EXECUTE FUNCTION reject_snapshot()`,
      );
      await sql`UPDATE ingestion_job SET next_due_at=now() WHERE id='aemet'`;
      try {
        expect(await ingest("aemet")).toMatchObject({
          status: "error",
          error: "ingestion_storage_error",
        });
        expect(await sql`SELECT * FROM raw_batch`).toHaveLength(0);
        expect(await sql`SELECT * FROM mobility_history`).toHaveLength(0);
        const [failed] =
          await sql`SELECT error_stage FROM ingestion_job WHERE id='aemet'`;
        expect(failed?.error_stage).toBe("publication");
      } finally {
        await sql.unsafe(`DROP TRIGGER reject_snapshot ON mobility_snapshot`);
        await sql.unsafe(`DROP FUNCTION reject_snapshot()`);
      }
      await sql`UPDATE ingestion_job SET next_due_at=now() WHERE id='aemet'`;
      expect(await ingest("aemet")).toMatchObject({ status: "healthy" });
      expect(await sql`SELECT * FROM raw_batch`).toHaveLength(1);
      expect(await sql`SELECT * FROM mobility_history`).toHaveLength(1);
    });
    it("retains corrections and reversions without duplicating identical retries", async () => {
      for (const raw of ["A", "A", "B", "B", "A"]) {
        fixture.weather.mockResolvedValueOnce({
          ...weather,
          raw,
          readings: [
            {
              stationId: "3195",
              name: "Retiro",
              latitude: 40.4,
              longitude: -3.7,
              observedAt: observation,
              measurements: [
                {
                  name: "temperature",
                  value: raw === "A" ? 1 : 2,
                  unit: "°C",
                  periodMinutes: 0,
                },
              ],
            },
          ],
        });
        await sql`UPDATE ingestion_job SET next_due_at=now() WHERE id='aemet'`;
        await ingest("aemet");
      }
      const rows =
        await sql`SELECT raw_reference FROM mobility_history ORDER BY revision_id`;
      expect(rows).toHaveLength(3);
      expect(rows[0]?.raw_reference).toBe(rows[2]?.raw_reference);
      expect(rows[0]?.raw_reference).not.toBe(rows[1]?.raw_reference);
    });
    it("versions normalized corrections even when raw is unchanged", async () => {
      for (const value of [1, 2]) {
        fixture.weather.mockResolvedValueOnce({
          ...weather,
          readings: [
            {
              stationId: "3195",
              name: "Retiro",
              latitude: 40.4,
              longitude: -3.7,
              observedAt: observation,
              measurements: [
                { name: "temperature", value, unit: "°C", periodMinutes: 0 },
              ],
            },
          ],
        });
        await sql`UPDATE ingestion_job SET next_due_at=now() WHERE id='aemet'`;
        await ingest("aemet");
      }
      expect(await sql`SELECT * FROM mobility_history`).toHaveLength(2);
      expect(await sql`SELECT * FROM raw_batch`).toHaveLength(1);
    });
    it("deduplicates unchanged normalized content despite raw formatting", async () => {
      for (const raw of ['{"value":1}', '{ "value": 1 }']) {
        fixture.weather.mockResolvedValueOnce({ ...weather, raw });
        await sql`UPDATE ingestion_job SET next_due_at=now() WHERE id='aemet'`;
        await ingest("aemet");
      }
      expect(await sql`SELECT * FROM mobility_history`).toHaveLength(1);
    });
    it("merges independent station updates and deduplicates identical retries", async () => {
      const make = (stationId: string, observedAt: string) => ({
        stationId,
        name: stationId,
        latitude: 40,
        longitude: -3,
        observedAt,
        measurements: [
          { name: "precipitation", value: 0, unit: "mm", periodMinutes: 60 },
        ],
      });
      const old = new Date(Date.now() - 3600000).toISOString();
      const first = {
        ...weather,
        readings: [make("3195", observation), make("3100B", old)],
      };
      for (const value of [
        first,
        first,
        {
          ...weather,
          raw: "regional-second",
          observedAt: old,
          readings: [
            make("3195", old),
            make("3100B", new Date(Date.parse(old) + 600000).toISOString()),
          ],
        },
      ]) {
        fixture.weather.mockResolvedValueOnce(value);
        await sql`UPDATE ingestion_job SET next_due_at=now() WHERE id='aemet'`;
        expect(await ingest("aemet")).toMatchObject({ status: "healthy" });
      }
      const [snapshot] =
        await sql`SELECT payload FROM mobility_snapshot WHERE job_id='aemet'`;
      expect(
        snapshot?.payload.readings.find(
          (r: { stationId: string }) => r.stationId === "3195",
        ).observedAt,
      ).toBe(observation);
      expect(
        snapshot?.payload.readings.find(
          (r: { stationId: string }) => r.stationId === "3100B",
        ).observedAt,
      ).not.toBe(old);
      expect(await sql`SELECT * FROM mobility_history`).toHaveLength(2);
    });
    it("retains late older data without rolling back the current snapshot", async () => {
      await sql`UPDATE ingestion_job SET next_due_at=now() WHERE id='aemet'`;
      await ingest("aemet");
      const older = new Date(Date.now() - 3600000).toISOString();
      fixture.weather.mockResolvedValueOnce({
        ...weather,
        raw: "late",
        observedAt: older,
      });
      await sql`UPDATE ingestion_job SET next_due_at=now() WHERE id='aemet'`;
      expect(await ingest("aemet")).toMatchObject({
        status: "historical_only",
      });
      const [current] =
        await sql`SELECT observed_at FROM mobility_snapshot WHERE job_id='aemet'`;
      expect(new Date(current?.observed_at).toISOString()).toBe(observation);
      expect(await sql`SELECT * FROM mobility_history`).toHaveLength(2);
      const at = new Date(Date.now() - 1800000).toISOString();
      expect(await history("aemet", at, "event")).toMatchObject({
        status: "available",
        observations: [{ observedAt: older }],
      });
      expect(await history("aemet", at, "knowledge")).toMatchObject({
        status: "unavailable",
      });
    });
    it("selects the revision known then, including EMT and deterministic ties", async () => {
      const now = Date.now();
      const observed = new Date(now - 3600000),
        firstKnown = new Date(now - 3000000),
        corrected = new Date(now - 600000),
        at = new Date(now - 1800000).toISOString();
      for (const [ref, known] of [
        ["a", firstKnown],
        ["b", corrected],
        ["c", corrected],
      ] as const)
        await sql`INSERT INTO mobility_history(job_id,observed_at,ingested_at,quality,raw_reference,payload,parser_version)
          VALUES ('emt-alerts',${observed},${known},'provisional',${ref},${sql.json({ alerts: [{ id: ref }] })},'fixture-v1')`;
      expect(await history("emt", at, "event")).toMatchObject({
        mode: "event",
        observations: [{ rawReference: "c", lagSeconds: 1800 }],
      });
      expect(await history("emt", at, "knowledge")).toMatchObject({
        mode: "knowledge",
        observations: [{ rawReference: "a" }],
      });
      expect(await history("emt", at)).toEqual(await history("emt", at));
    });
    it("excludes expired history even before the next prune", async () => {
      await sql`INSERT INTO mobility_history(job_id,observed_at,ingested_at,quality,raw_reference,payload)
        VALUES ('aemet',now()-interval '25 hours',now()-interval '25 hours','provisional','old','{}')`;
      expect(
        await history("aemet", new Date(Date.now() - 3600000).toISOString()),
      ).toMatchObject({ status: "unavailable" });
      expect(
        await history("emt", new Date(Date.now() - 90000000).toISOString()),
      ).toMatchObject({ reason: "outside_24h_retention" });
    });
    it("reports stale observations as degraded despite successful fetch", async () => {
      await sql`UPDATE ingestion_job SET next_due_at=now() WHERE id='aemet'`;
      fixture.weather.mockResolvedValueOnce({
        ...weather,
        observedAt: new Date(Date.now() - 86400000).toISOString(),
      });
      expect(await ingest("aemet")).toMatchObject({ status: "degraded" });
    });
  },
);
