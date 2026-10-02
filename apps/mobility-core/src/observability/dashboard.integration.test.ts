import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  sql: null as ReturnType<typeof postgres> | null,
}));
vi.mock("../database", () => ({ database: () => fixture.sql }));

import { readEntities } from "../dashboard/entities";
import { executeManual, readExecution } from "../dashboard/executions";
import { readOverview } from "../dashboard/overview";
import { readSources, readTrace } from "../dashboard/readers";
import { readEntitySeries } from "../dashboard/series";
import { boundedTransaction, observabilityPool } from "./database";
import { pruneObservability } from "./retention";
import { storeTelemetry } from "./telemetry";

const schema = `dashboard_e2e_${randomUUID().replaceAll("-", "")}`;
const owner = randomUUID(),
  other = randomUUID();
let admin: ReturnType<typeof postgres>, sql: ReturnType<typeof postgres>;
let originalUrl: string | undefined;
let measuring = false;
const measured: { query: string; parameters: unknown[] }[] = [];
const payload = () => ({
  schemaVersion: 1,
  id: randomUUID(),
  kind: "model_input",
  capturedAt: new Date().toISOString(),
  originalBytes: 100,
  retainedBytes: 80,
  redacted: false,
  truncated: false,
  captureStatus: "captured",
  reason: null,
  content: {
    messages: [
      { role: "user", parts: [{ type: "text", text: "synthetic message" }] },
    ],
    functions: [],
  },
});
const event = (extra = {}) => ({
  eventKey: randomUUID(),
  kind: "attempt_completed",
  occurredAt: new Date().toISOString(),
  turnId: "turn1",
  stepIndex: 0,
  sequence: 1,
  purpose: "step",
  attemptId: randomUUID(),
  callId: null,
  tool: null,
  providerResponseId: "response1",
  status: "succeeded",
  durationMs: 12,
  isError: null,
  errorCode: null,
  usage: {
    inputTokens: 10,
    outputTokens: 4,
    cachedInputTokens: 2,
    reasoningTokens: null,
  },
  payloadIds: [],
  captureStatus: "captured",
  sentCallIds: [],
  ...extra,
});
const batch = (
  events: unknown[],
  payloads: unknown[] = [],
  principalId = owner,
  sessionId = "owned",
) => ({
  schemaVersion: 1,
  batchId: randomUUID(),
  principalId,
  sessionId,
  events,
  payloads,
});
describe.skipIf(process.env.RUN_DASHBOARD_DB_TESTS !== "1")(
  "dashboard end-to-end isolated PostgreSQL",
  () => {
    beforeAll(async () => {
      originalUrl = process.env.DATABASE_URL;
      if (
        !originalUrl ||
        !["localhost", "127.0.0.1", "[::1]"].includes(
          new URL(originalUrl).hostname,
        )
      )
        throw Error("Local DB required");
      admin = postgres(originalUrl, { max: 1, onnotice: () => {} });
      await admin.unsafe(`CREATE SCHEMA ${schema}`);
      sql = postgres(originalUrl, {
        max: 4,
        connection: { search_path: `${schema},public` },
        debug: (_connection, query, parameters) => {
          if (measuring && /^(SELECT|WITH)\b/i.test(query.trim()))
            measured.push({ query, parameters });
        },
        onnotice: () => {},
      });
      fixture.sql = sql;
      const migrationDir = new URL(
        "../../../../infra/postgres/migrations/",
        import.meta.url,
      );
      for (const name of (await readdir(migrationDir))
        .filter((n) => n.endsWith(".sql"))
        .sort())
        await sql.unsafe(await readFile(new URL(name, migrationDir), "utf8"));
      for (const [i, id] of [owner, other].entries()) {
        await sql`INSERT INTO auth_user(id,name,email,"emailVerified") VALUES(${id},'synthetic',${`fixture${i}@example.invalid`},false)`;
        await sql`INSERT INTO evaluator(id,slot,label,auth_user_id) VALUES(${id},${i + 1},'synthetic',${id})`;
      }
      await sql`INSERT INTO evaluation_session(session_id,evaluator_id) VALUES('owned',${owner}),('foreign',${other})`;
      const u = new URL(originalUrl);
      u.searchParams.set("options", `-c search_path=${schema},public`);
      process.env.DATABASE_URL = u.href;
      process.env.MOBILITY_MCP_SECRET = "synthetic-dashboard-cursor-secret";
    }, 20000);
    afterAll(async () => {
      await observabilityPool().end();
      await sql?.end();
      if (admin) {
        await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
      if (originalUrl) process.env.DATABASE_URL = originalUrl;
    });
    it("persists self-contained terminal, deduplicates and counts usage once", async () => {
      const p = payload(),
        e = event({ payloadIds: [p.id] });
      expect(await storeTelemetry(batch([e], [p]))).toMatchObject({
        accepted: true,
      });
      expect(await storeTelemetry(batch([e], [p]))).toMatchObject({
        accepted: true,
      });
      const [row] =
        await sql`SELECT event_count,retained_bytes FROM conversation_observability WHERE session_id='owned'`;
      expect(row?.event_count).toBe(1);
      expect(Number(row?.retained_bytes)).toBeGreaterThan(0);
      const summary = await readTrace(
        owner,
        "owned",
        "summary",
        new URLSearchParams(),
      );
      expect(summary).toMatchObject({
        usage: { inputTokens: 10, outputTokens: 4, cachedInputTokens: 2 },
      });
      await expect(
        storeTelemetry(batch([event()], [p], other, "foreign")),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("denies foreign ownership and handles missing payload references honestly", async () => {
      await expect(
        readTrace(other, "owned", "summary", new URLSearchParams()),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        storeTelemetry(batch([event()], [], other, "owned")),
      ).rejects.toMatchObject({ status: 404 });
      await storeTelemetry(batch([event({ payloadIds: [randomUUID()] })]));
      const [r] =
        await sql`SELECT capture_status,payload_1 FROM conversation_trace_event WHERE session_id='owned' ORDER BY id DESC LIMIT 1`;
      expect(r).toMatchObject({ capture_status: "missing", payload_1: null });
    });
    it("bounded observer returns under lock contention without detached writes", async () => {
      let release: () => void = () => {},
        locked: () => void = () => {};
      const ready = new Promise<void>((r) => {
          locked = r;
        }),
        done = new Promise<void>((r) => {
          release = r;
        });
      const blocker = sql.begin(async (tx) => {
        await tx`SELECT * FROM observability_quota WHERE evaluator_id=${owner} FOR UPDATE`;
        locked();
        await done;
      });
      await ready;
      const start = performance.now();
      await expect(storeTelemetry(batch([event()]))).rejects.toThrow();
      expect(performance.now() - start).toBeLessThan(300);
      release();
      await blocker;
      await boundedTransaction((c) => c.query("SELECT 1"));
    });
    it("rolls back a slow SQL statement and reuses the bounded observer pool", async () => {
      const start = performance.now();
      await expect(
        boundedTransaction((c) => c.query("SELECT pg_sleep(0.5)")),
      ).rejects.toThrow();
      expect(performance.now() - start).toBeLessThan(200);
      await boundedTransaction((c) => c.query("SELECT 1"));
    });
    it("terminal outranks a late prepared event without double-counting tokens", async () => {
      const attemptId = randomUUID();
      await storeTelemetry(batch([event({ attemptId })]));
      await storeTelemetry(
        batch([
          event({
            attemptId,
            kind: "attempt_prepared",
            status: "prepared",
            usage: null,
          }),
        ]),
      );
      const result = await readTrace(
        owner,
        "owned",
        "summary",
        new URLSearchParams(),
      );
      expect(result).toMatchObject({
        counts: { attempts: 3 },
        usage: { inputTokens: 30 },
      });
    });
    it("applies session content cap atomically and marks missing payloads", async () => {
      await sql`UPDATE conversation_observability SET retained_bytes=16777216 WHERE session_id='owned'`;
      const p = payload();
      const part = p.content.messages[0]?.parts[0];
      if (part) part.text = "unique omitted fixture";
      await storeTelemetry(batch([event({ payloadIds: [p.id] })], [p]));
      const [capture] =
        await sql`SELECT retained_bytes,known_gaps,coverage FROM conversation_observability WHERE session_id='owned'`;
      expect(Number(capture?.retained_bytes)).toBe(16777216);
      expect(Number(capture?.known_gaps)).toBeGreaterThan(0);
      expect(capture?.coverage).toBe("partial");
      await sql`UPDATE conversation_observability SET retained_bytes=(SELECT coalesce(sum(retained_bytes),0) FROM conversation_trace_payload WHERE session_id='owned') WHERE session_id='owned'`;
    });
    it("filters and paginates stored entities, invalidating every changed revision", async () => {
      const now = new Date().toISOString();
      await sql`INSERT INTO mobility_snapshot(job_id,source_id,observed_at,ingested_at,quality,raw_reference,payload) VALUES('bicimad','bicimad',${now},${now},'provisional','synthetic',${sql.json(
        {
          stations: [
            {
              id: "a",
              name: "A",
              latitude: 40.4,
              longitude: -3.7,
              bikes: 2,
              observedAt: now,
            },
            {
              id: "b",
              name: "B",
              latitude: 40.4,
              longitude: -3.7,
              bikes: 3,
              observedAt: now,
            },
          ],
        },
      )})`;
      const page = await readEntities({ category: "bikes", limit: 1 }, owner);
      expect(page.entities).toHaveLength(1);
      expect("nextCursor" in page && page.nextCursor).toBeTruthy();
      const cursor = "nextCursor" in page ? page.nextCursor : null;
      const next = await readEntities(
        { category: "bikes", limit: 1, cursor },
        owner,
      );
      expect(next.entities[0]?.id).toBe("b");
      await sql`UPDATE mobility_snapshot SET ingested_at=now()+interval '1 second' WHERE job_id='bicimad'`;
      await expect(
        readEntities({ category: "bikes", limit: 1, cursor }, owner),
      ).rejects.toMatchObject({ status: 409 });
      const filtered = await readEntities(
        { category: "bikes", search: "B" },
        owner,
      );
      expect(filtered.entities.map((e) => e.id)).toEqual(["b"]);
    });
    it("executes the shared stored-only tool once and enforces request/owner isolation", async () => {
      const requestId = randomUUID();
      const input = {
        requestId,
        tool: "get_network_status",
        input: {},
        confirmEffects: true,
      };
      const first = await executeManual(
        owner,
        input,
        new AbortController().signal,
        ["mobility.read"],
      );
      expect(first.state).toBe("succeeded");
      const second = await executeManual(
        owner,
        input,
        new AbortController().signal,
        ["mobility.read"],
      );
      expect(second.id).toBe(first.id);
      await expect(
        executeManual(
          owner,
          { ...input, input: { source: "renfe" } },
          new AbortController().signal,
          ["mobility.read"],
        ),
      ).rejects.toMatchObject({ status: 409 });
      await expect(readExecution(other, first.id)).rejects.toMatchObject({
        status: 404,
      });
      await sql`UPDATE dashboard_tool_execution SET expires_at=now()-interval '1 second' WHERE id=${first.id}`;
    });
    it("keeps full-selection totals independent of pagination and bounds derived insights", async () => {
      const first = await readEntities({ category: "bikes", limit: 1 }, owner);
      const full = await readEntities({ category: "bikes", limit: 100 }, owner);
      const recent = await readEntities(
        { category: "bikes", freshness: "recent" },
        owner,
      );
      expect(recent.entities).toHaveLength(2);
      expect(first.totals?.total).toBe(2);
      expect(full.totals).toMatchObject({ total: 2 });
      const tariffs = await readEntities(
        {
          category: "places",
          section: "reference",
          product: "reference:tariffs",
        },
        owner,
      );
      expect(tariffs.entities.length).toBeGreaterThan(0);
      expect(tariffs.entities.every((e) => e.kind === "catalog")).toBe(true);
      const overview = await readOverview(new URLSearchParams());
      expect(overview.metrics).toHaveLength(4);
      expect(overview.products).toHaveLength(13);
      expect(overview.activity.bins).toHaveLength(24);
      const series = await readEntitySeries("bikes", "a", {});
      expect(series.points).toHaveLength(0);
      expect(series.coverage).toBe("partial");
    });
    it("filters tool families before paging and paginates chronological turns without partial-zero usage", async () => {
      await sql`INSERT INTO evaluation_session(session_id,evaluator_id) VALUES('dense',${owner})`;
      const start = Date.now() - 3600000;
      const entries = Array.from({ length: 60 }, (_, i) =>
        event({
          turnId: `t${i.toString().padStart(2, "0")}`,
          occurredAt: new Date(start + i * 1000).toISOString(),
          usage:
            i === 0
              ? {
                  inputTokens: null,
                  outputTokens: 3,
                  cachedInputTokens: null,
                  reasoningTokens: null,
                }
              : null,
        }),
      );
      for (let i = 0; i < entries.length; i += 32)
        await storeTelemetry(
          batch(entries.slice(i, i + 32), [], owner, "dense"),
        );
      await storeTelemetry(
        batch(
          [
            event({
              kind: "tool_requested",
              attemptId: null,
              callId: "qualified",
              tool: "mobility__get_network_status",
              usage: null,
            }),
            event({
              kind: "tool_result",
              attemptId: null,
              callId: "qualified",
              tool: "mobility__get_network_status",
              usage: null,
            }),
          ],
          [],
          owner,
          "dense",
        ),
      );
      const summary = await readTrace(
        owner,
        "dense",
        "summary",
        new URLSearchParams(),
      );
      expect(summary).toMatchObject({
        totalTurns: 61,
        counts: { tools: 1, missing: 60 },
        usage: { inputTokens: null, outputTokens: 3, totalTokens: null },
      });
      expect("turns" in summary && summary.turns[0]?.turnId).toBe("t00");
      expect("turns" in summary && summary.turns).toHaveLength(50);
      const cursor =
        "nextTurnCursor" in summary ? summary.nextTurnCursor : null;
      expect(cursor).toBeTruthy();
      const next = await readTrace(
        owner,
        "dense",
        "summary",
        new URLSearchParams({ turnCursor: cursor ?? "" }),
      );
      expect("turns" in next && next.turns).toHaveLength(11);
      const tools = await readTrace(
        owner,
        "dense",
        "events",
        new URLSearchParams({ family: "tools", limit: "1", call: "qualified" }),
      );
      expect(tools).toMatchObject({
        events: [
          {
            callId: "qualified",
            toolIdentity: {
              runtimeName: "mobility__get_network_status",
              canonicalName: "get_network_status",
            },
          },
        ],
      });
    });
    it("reduces more than 240 observations and uses the latest retained correction without interpolation", async () => {
      const now = Date.now(),
        latest = new Date(now - 10000).toISOString();
      const observations = Array.from({ length: 300 }, (_, i) => ({
        job_id: "bicimad",
        observed_at: new Date(now - 310000 + i * 1000).toISOString(),
        ingested_at: new Date(now - 9000).toISOString(),
        quality: "provisional",
        raw_reference: "synthetic-series",
        payload: {
          stations: [
            {
              id: "dense-series",
              observedAt: new Date(now - 310000 + i * 1000).toISOString(),
              bikes: i,
            },
          ],
        },
      }));
      await sql`INSERT INTO mobility_history ${sql(observations)}`;
      await sql`INSERT INTO mobility_history(job_id,observed_at,ingested_at,quality,raw_reference,payload) VALUES('bicimad',${latest},now(),'provisional','synthetic-late-correction',${sql.json({ stations: [{ id: "dense-series", observedAt: latest, bikes: 999 }] })})`;
      const series = await readEntitySeries("bikes", "dense-series", {
        window: "1h",
      });
      expect(series.reduced).toBe(true);
      expect(series.points.length).toBeLessThanOrEqual(240);
      expect(series.points.at(-1)).toMatchObject({
        observedAt: latest,
        value: 999,
      });
      expect(
        series.points.every(
          (p) => Date.parse(p.ingestedAt) > Date.parse(p.observedAt),
        ),
      ).toBe(true);
      expect(series).toMatchObject({
        mode: "event",
        coverage: "partial",
        unit: "bicicletas",
      });
    });
    it("records actual stored-reader query plans with explicit row and time bounds", async () => {
      measuring = true;
      try {
        await readEntities({ category: "bikes", limit: 1 }, owner);
        await readOverview(new URLSearchParams());
        await readEntitySeries("bikes", "dense-series", { window: "1h" });
        await readTrace(owner, "dense", "summary", new URLSearchParams());
      } finally {
        measuring = false;
      }
      const plans: {
        root: string;
        planningMs: number;
        executionMs: number;
        rows: number;
      }[] = [];
      for (const query of measured) {
        const result = await sql.unsafe(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.query}`,
          query.parameters as [],
        );
        const plan = result[0]?.["QUERY PLAN"]?.[0];
        expect(plan).toBeTruthy();
        expect(Number(plan["Execution Time"])).toBeLessThan(3000);
        plans.push({
          root: String(plan.Plan["Node Type"]),
          planningMs: Number(plan["Planning Time"]),
          executionMs: Number(plan["Execution Time"]),
          rows: Number(plan.Plan["Actual Rows"]),
        });
      }
      await mkdir("tmp/dashboard-qa", { recursive: true });
      await writeFile(
        "tmp/dashboard-qa/sql-plans.json",
        JSON.stringify(
          {
            environment:
              "isolated PostgreSQL, synthetic fixtures, not production performance",
            queryCount: plans.length,
            plans,
          },
          null,
          2,
        ),
      );
      expect(plans.length).toBeGreaterThan(10);
    });
    it("reads meteorological history by station and magnitude without mixing units", async () => {
      const at = new Date(Date.now() - 60000).toISOString();
      await sql`INSERT INTO mobility_history(job_id,observed_at,ingested_at,quality,raw_reference,payload) VALUES('aemet',${at},now(),'provisional','synthetic-weather-series',${sql.json(
        {
          readings: [
            {
              stationId: "qa-weather",
              observedAt: at,
              measurements: [
                {
                  name: "temperature",
                  value: 18,
                  unit: "°C",
                  periodMinutes: 0,
                },
                {
                  name: "precipitation",
                  value: 2,
                  unit: "mm",
                  periodMinutes: 60,
                },
              ],
            },
          ],
        },
      )})`;
      const temperature = await readEntitySeries("environment", "qa-weather", {
        product: "aemet",
        magnitude: "temperature",
        window: "1h",
      });
      expect(temperature.points.map((p) => p.value)).toEqual([18]);
      expect(temperature.unit).toBe("°C");
      const rain = await readEntitySeries("environment", "qa-weather", {
        product: "aemet",
        magnitude: "precipitation",
        window: "1h",
      });
      expect(rain.points.map((p) => p.value)).toEqual([2]);
      expect(rain.unit).toBe("mm");
      expect(rain.warning).toContain("agregada");
    });
    it("reads source aggregate and removes expired content and quota safely", async () => {
      expect(await readSources()).toBeTruthy();
      await sql`UPDATE conversation_trace_payload SET expires_at=now()-interval '1 second' WHERE session_id='owned'`;
      await pruneObservability();
      const [r] =
        await sql`SELECT count(*)::int AS n FROM conversation_trace_payload WHERE session_id='owned'`;
      expect(r?.n).toBe(0);
      const [q] =
        await sql`SELECT retained_bytes FROM observability_quota WHERE evaluator_id=${owner}`;
      expect(Number(q?.retained_bytes)).toBe(0);
    });
  },
);
