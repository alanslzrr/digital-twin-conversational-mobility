import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  sql: null as ReturnType<typeof postgres> | null,
}));
vi.mock("../database", () => ({ database: () => fixture.sql }));

import { readEntities } from "../dashboard/entities";
import { executeManual, readExecution } from "../dashboard/executions";
import { readSources, readTrace } from "../dashboard/readers";
import { boundedTransaction, observabilityPool } from "./database";
import { pruneObservability } from "./retention";
import { storeTelemetry } from "./telemetry";

const schema = `dashboard_e2e_${randomUUID().replaceAll("-", "")}`;
const owner = randomUUID(),
  other = randomUUID();
let admin: ReturnType<typeof postgres>, sql: ReturnType<typeof postgres>;
let originalUrl: string | undefined;
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
