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
vi.mock("./database", () => ({ database: () => fixture.sql }));
vi.mock("./adapters/emt-transit", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchEmtArrivals: fixture.fetch,
}));

import { parseEmtCatalog } from "./adapters/emt-transit";
import { storeEmtCatalog } from "./catalogs/emt-store";
import { emtArrivals } from "./emt-arrivals";
import { resolvePlace } from "./mobility";

const schema = `emt_test_${randomUUID().replaceAll("-", "")}`;
let admin: ReturnType<typeof postgres>, sql: ReturnType<typeof postgres>;
let placeId: string, secondId: string;
const catalog = parseEmtCatalog(
  {
    code: "00",
    data: ["72", "73"].map((node) => ({
      node,
      name: "Cibeles",
      geometry: { type: "Point", coordinates: [-3.69, 40.42] },
      lines: ["361/1", "361/2"],
    })),
  },
  {
    code: "00",
    data: [{ line: "361", label: "001", nameA: "ATOCHA", nameB: "MONCLOA" }],
  },
);
const manifest = { version: "fixture-v1", fetchedAt: new Date().toISOString() };
const feed = () => ({
  raw: '{"fixture":true}',
  observedAt: new Date().toISOString(),
  arrivals: [
    {
      line: "001",
      destination: "MONCLOA",
      destinationEvidence: "provider",
      estimateSecondsAtObservation: 60,
      estimatedArrivalAt: new Date(Date.now() + 60000).toISOString(),
      estimateStatus: "estimated",
      distanceMeters: 200,
    },
  ],
});

describe.skipIf(process.env.RUN_EMT_DB_TESTS !== "1")(
  "EMT cache and import in isolated PostgreSQL schema",
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
        max: 4,
        connection: { search_path: `${schema},public` },
        onnotice: () => {},
      });
      fixture.sql = sql;
      for (const name of [
        "0001_foundation.sql",
        "0004_local_mobility.sql",
        "0013_emt_catalog_arrivals.sql",
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
      await storeEmtCatalog(sql, catalog, manifest);
      const places =
        await sql`SELECT external_id,place_id FROM place_external_identifier WHERE source_id='emt' ORDER BY external_id`;
      placeId = places[0]?.place_id;
      secondId = places[1]?.place_id;
    });
    beforeEach(async () => {
      vi.stubEnv("INGESTION_ENABLED", "true");
      vi.stubEnv("VERCEL", "");
      fixture.fetch.mockReset().mockImplementation(async () => feed());
      await storeEmtCatalog(sql, catalog, manifest);
      await sql`UPDATE source_catalog SET enabled=true WHERE id='emt'`;
      await sql`UPDATE ingestion_activity SET active_until=now()+interval '30 minutes'`;
      await sql`UPDATE emt_arrival_cache SET observed_at=NULL,ingested_at=NULL,payload=NULL,lease_token=NULL,lease_until=NULL,failures=0,error_code=NULL,next_due_at=now()-interval '1 minute'`;
      await sql`UPDATE emt_arrival_gate SET lease_token=NULL,lease_until=NULL,failures=0,error_code=NULL,next_due_at=now()-interval '1 minute'`;
    });
    afterAll(async () => {
      vi.unstubAllEnvs();
      if (sql) await sql.end();
      if (admin) {
        await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    });
    it("imports idempotently, resolves number or ambiguous name and preserves zeros/directions", async () => {
      await storeEmtCatalog(sql, catalog, manifest);
      expect((await resolvePlace("72", 5, "emt")).places[0]).toMatchObject({
        id: placeId,
        emtLines: [
          { lineId: "361", label: "001", direction: "1" },
          { direction: "2" },
        ],
      });
      expect((await resolvePlace("Cibeles", 5, "emt")).ambiguous).toBe(true);
      expect(await sql`SELECT id FROM canonical_place`).toHaveLength(2);
    });
    it("hides removed stops and restores their original UUID on reappearance", async () => {
      await storeEmtCatalog(
        sql,
        { ...catalog, stops: catalog.stops.slice(1) },
        { ...manifest, version: "fixture-v2" },
      );
      expect((await resolvePlace("72", 5, "emt")).places).toHaveLength(0);
      expect(await emtArrivals(placeId, 5)).toMatchObject({
        reason: "current_emt_stop_required",
      });
      await storeEmtCatalog(sql, catalog, manifest);
      expect((await resolvePlace("72", 5, "emt")).places[0]?.id).toBe(placeId);
      expect(fixture.fetch).not.toHaveBeenCalled();
    });
    it("performs one request, persists cache, and suppresses same/different stop bursts", async () => {
      const first = await emtArrivals(placeId, 5);
      expect(first).toMatchObject({
        status: "available",
        freshness: { status: "fresh" },
        arrivals: [{ line: "001" }],
      });
      const second = await emtArrivals(placeId, 5);
      expect(second).toMatchObject({
        provenance: "provenance" in first ? first.provenance : null,
      });
      await emtArrivals(secondId, 5);
      expect(fixture.fetch).toHaveBeenCalledTimes(1);
    });
    it("excludes concurrent refreshes without holding a transaction across the provider request", async () => {
      let finish!: (value: ReturnType<typeof feed>) => void;
      fixture.fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const first = emtArrivals(placeId, 5);
      await vi.waitFor(() => expect(fixture.fetch).toHaveBeenCalledTimes(1));
      expect(await emtArrivals(placeId, 5)).toMatchObject({
        refresh: { inProgress: true },
        status: "unavailable",
      });
      await emtArrivals(secondId, 5);
      finish(feed());
      await first;
      expect(fixture.fetch).toHaveBeenCalledTimes(1);
    });
    it("retains stale evidence on failures and applies provider-wide backoff", async () => {
      const old = new Date(Date.now() - 120000).toISOString();
      await sql`UPDATE emt_arrival_cache SET observed_at=${old},ingested_at=${old},payload=${sql.json(feed().arrivals)},raw_reference='fixture' WHERE stop_id='72'`;
      fixture.fetch.mockRejectedValue(new TypeError("secret provider details"));
      expect(await emtArrivals(placeId, 5)).toMatchObject({
        freshness: { status: "stale" },
        refresh: { error: "upstream_network_error" },
        arrivals: [
          { remainingSeconds: null, basis: "stale_provider_estimate" },
        ],
      });
      await emtArrivals(placeId, 5);
      await emtArrivals(secondId, 5);
      expect(fixture.fetch).toHaveBeenCalledTimes(1);
      const [gate] =
        await sql`SELECT failures,next_due_at>now() AS waiting FROM emt_arrival_gate`;
      expect(gate).toMatchObject({ failures: 1, waiting: true });
    });
    it("recovers expired leases without replaying missed refreshes", async () => {
      const token = randomUUID();
      await sql`UPDATE emt_arrival_cache SET lease_token=${token},lease_until=now()-interval '1 second'`;
      await sql`UPDATE emt_arrival_gate SET lease_token=${token},lease_until=now()-interval '1 second'`;
      await emtArrivals(placeId, 5);
      await emtArrivals(placeId, 5);
      expect(fixture.fetch).toHaveBeenCalledTimes(1);
    });
    it("fences a late response after the lease owner has changed", async () => {
      fixture.fetch.mockImplementation(async () => {
        await sql`UPDATE emt_arrival_gate SET lease_token=${randomUUID()}`;
        return feed();
      });
      expect(await emtArrivals(placeId, 5)).toMatchObject({
        status: "unavailable",
        arrivals: [],
      });
      expect(
        (await sql`SELECT payload FROM emt_arrival_cache WHERE stop_id='72'`)[0]
          ?.payload,
      ).toBeNull();
    });
    it("does not request unknown places, disabled previews, sources or inactive windows", async () => {
      await emtArrivals(randomUUID(), 5);
      vi.stubEnv("VERCEL", "1");
      await emtArrivals(placeId, 5);
      vi.stubEnv("VERCEL", "");
      await sql`UPDATE ingestion_activity SET active_until=now()-interval '1 minute'`;
      await emtArrivals(placeId, 5);
      await sql`UPDATE ingestion_activity SET active_until=now()+interval '1 minute'`;
      await sql`UPDATE source_catalog SET enabled=false WHERE id='emt'`;
      await emtArrivals(placeId, 5);
      expect(fixture.fetch).not.toHaveBeenCalled();
    });
  },
);
