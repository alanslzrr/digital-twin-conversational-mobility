import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import {
  type OtelBatch,
  type OtelEnrichment,
  telemetryEvent,
} from "@mobility/contracts";
import { SignJWT } from "jose";
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
import { POST } from "../../app/internal/telemetry/route";
import { readTrace } from "../dashboard/readers";
import { database } from "../database";
import { observabilityPool } from "./database";
import { enrichTelemetry } from "./otel";
import { pruneObservability } from "./retention";
import { storeTelemetry } from "./telemetry";

const enabled = process.env.RUN_CONTROL_DB_TESTS === "1";
const schema = `otel_test_${randomUUID().replaceAll("-", "")}`;
const owner = randomUUID(),
  other = randomUUID();
let admin: ReturnType<typeof postgres>;
let observedAt = Date.now();
const secret = "synthetic-otel-service-secret-at-least-32";
const makeEvent = (overrides = {}) =>
  telemetryEvent.parse({
    eventKey: randomUUID(),
    kind: "attempt_completed",
    occurredAt: new Date(observedAt).toISOString(),
    turnId: "turn",
    stepIndex: 0,
    sequence: 0,
    purpose: "step",
    attemptId: randomUUID(),
    callId: null,
    tool: null,
    providerResponseId: null,
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
    captureStatus: "missing",
    sentCallIds: [],
    ...overrides,
  });
const eventBatch = (events: ReturnType<typeof makeEvent>[]) => ({
  schemaVersion: 1,
  batchId: randomUUID(),
  principalId: owner,
  sessionId: "owned",
  events,
  payloads: [],
});
function enrichment(
  target: OtelEnrichment["target"] = {
    kind: "model",
    turnId: "turn",
    stepIndex: 0,
    purpose: "step",
  },
): OtelEnrichment {
  const start = observedAt - 25;
  return {
    target,
    span: {
      source: "eve@0.65.0",
      kind: target.kind,
      traceId: "a".repeat(32),
      spanId: randomUUID().replaceAll("-", "").slice(0, 16),
      parentSpanId: "b".repeat(16),
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(start + 50).toISOString(),
      durationMs: 50,
    },
  };
}
const batch = (spans = [enrichment()]): OtelBatch => ({
  schemaVersion: 1,
  type: "otel_enrichment",
  principalId: owner,
  sessionId: "owned",
  spans,
});

describe.skipIf(!enabled)(
  "OTel enrichment against disposable PostgreSQL and authenticated sink",
  () => {
    beforeAll(async () => {
      const url = process.env.MOBAI_TEST_DATABASE_URL;
      if (
        !url ||
        new URL(url).hostname !== "127.0.0.1" ||
        new URL(url).pathname !== "/mobai_control_test"
      )
        throw Error(
          "Dedicated disposable mobai_control_test database required",
        );
      admin = postgres(url, { max: 1, onnotice: () => {} });
      await admin.unsafe(`CREATE SCHEMA ${schema}`);
      const scoped = new URL(url);
      scoped.searchParams.set("options", `-c search_path=${schema},public`);
      vi.stubEnv("DATABASE_URL", scoped.href);
      const dir = new URL(
        "../../../../infra/postgres/migrations/",
        import.meta.url,
      );
      for (const name of (await readdir(dir))
        .filter((n) => n.endsWith(".sql"))
        .sort())
        await database().unsafe(await readFile(new URL(name, dir), "utf8"));
      vi.stubEnv("MOBILITY_JWT_SECRET", secret);
      vi.stubEnv("MOBILITY_JWT_ISSUER", "test");
      vi.stubEnv("MOBILITY_JWT_AUDIENCE", "test");
    }, 30000);
    beforeEach(async () => {
      observedAt = Date.now() - 100;
      vi.stubEnv("MOBAI_OTEL_ENABLED", "true");
      vi.stubEnv("DEPLOYMENT_ENV", "test");
      vi.stubEnv("VERCEL_ENV", "development");
      const sql = database();
      await sql`TRUNCATE auth_user CASCADE`;
      for (const id of [owner, other]) {
        await sql`INSERT INTO auth_user(id,name,email,"emailVerified") VALUES(${id},'synthetic',${`${id}@example.invalid`},false)`;
        await sql`INSERT INTO evaluator(id,label,auth_user_id) VALUES(${id},'synthetic',${id})`;
      }
      await sql`INSERT INTO evaluation_session(session_id,evaluator_id) VALUES('owned',${owner}),('foreign',${other})`;
      await observabilityPool().query("SELECT 1");
    });
    afterAll(async () => {
      if (admin) {
        await observabilityPool().end();
        await database().end({ timeout: 1 });
        await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
        await admin.end();
      }
      vi.unstubAllEnvs();
    });
    it("enriches model/step/tool/turn once without changing events, usage, hashes, retention or ledger", async () => {
      const events = [
        makeEvent(),
        makeEvent({ kind: "step_completed", attemptId: null }),
        makeEvent({
          kind: "tool_result",
          attemptId: null,
          callId: "call",
          tool: "resolve_place",
        }),
        makeEvent({ kind: "turn_completed", attemptId: null }),
      ];
      await storeTelemetry(eventBatch(events));
      const sql = database();
      const before =
        await sql`SELECT id,content_hash,expires_at,input_tokens,output_tokens FROM conversation_trace_event ORDER BY id`;
      const b = batch([
        enrichment(),
        enrichment({ kind: "step", turnId: "turn", stepIndex: 0 }),
        enrichment({ kind: "tool", callId: "call" }),
        enrichment({ kind: "turn", turnId: "turn" }),
      ]);
      expect(await enrichTelemetry(b)).toMatchObject({
        attached: 4,
        unmatched: 0,
      });
      expect(await enrichTelemetry(b)).toMatchObject({
        attached: 4,
        unmatched: 0,
      });
      await storeTelemetry(eventBatch(events)); // Original hashes remain replayable.
      expect(
        await sql`SELECT id,content_hash,expires_at,input_tokens,output_tokens FROM conversation_trace_event ORDER BY id`,
      ).toEqual(before);
      expect(
        (await sql`SELECT event_count FROM conversation_observability`)[0]
          ?.event_count,
      ).toBe(4);
      expect(
        (await sql`SELECT count(*)::int AS n FROM llm_attempt`)[0]?.n,
      ).toBe(0);
      const page = (await readTrace(
        owner,
        "owned",
        "events",
        new URLSearchParams(),
      )) as { events: { otel: unknown; attemptId: string | null }[] };
      expect(page.events.filter((e) => e.otel)).toHaveLength(4);
      expect(page.events[0]?.attemptId).toBe(events[0]?.attemptId);
    });
    it("never creates a replacement event or chooses between ambiguous attempts", async () => {
      const b = batch();
      expect(await enrichTelemetry(b)).toMatchObject({
        attached: 0,
        unmatched: 1,
      });
      expect(
        (
          await database()`SELECT count(*)::int AS n FROM conversation_observability`
        )[0]?.n,
      ).toBe(0);
      await storeTelemetry(eventBatch([makeEvent(), makeEvent()]));
      expect(await enrichTelemetry(b)).toMatchObject({
        attached: 0,
        unmatched: 1,
      });
    });
    it("distinguishes compaction coordinates and does not overwrite a different native span", async () => {
      await storeTelemetry(
        eventBatch([makeEvent(), makeEvent({ purpose: "compaction" })]),
      );
      const b = batch([
        enrichment({
          kind: "model",
          turnId: "turn",
          stepIndex: 0,
          purpose: "compaction",
        }),
      ]);
      expect(await enrichTelemetry(b)).toMatchObject({ attached: 1 });
      expect(
        await enrichTelemetry(batch([enrichment(b.spans[0]?.target)])),
      ).toMatchObject({ attached: 0 });
      expect(
        (
          await database()`SELECT purpose FROM conversation_trace_event WHERE otel_span IS NOT NULL`
        )[0]?.purpose,
      ).toBe("compaction");
    });
    it.each([-1000, 1000])(
      "rejects an unrelated terminal %i ms outside the model interval without guessing an attempt",
      async (offset) => {
        const old = makeEvent({
          occurredAt: new Date(observedAt + offset).toISOString(),
        });
        await storeTelemetry(eventBatch([old]));
        const b = batch();
        // Same turn/step/purpose, but the matching terminal was never captured.
        expect(await enrichTelemetry(b)).toMatchObject({
          attached: 0,
          unmatched: 1,
        });
        expect(
          (await database()`SELECT otel_span FROM conversation_trace_event`)[0]
            ?.otel_span,
        ).toBeNull();
        // Even when a plausible terminal arrives, timestamps must not choose
        // between two attempts with the same coordinates.
        await storeTelemetry(eventBatch([makeEvent()]));
        expect(await enrichTelemetry(b)).toMatchObject({
          attached: 0,
          unmatched: 1,
        });
      },
    );
    it("serializes concurrent enrichment and drops conflicting target mappings", async () => {
      await storeTelemetry(eventBatch([makeEvent()]));
      const b = batch();
      const results = await Promise.all([
        enrichTelemetry(b),
        enrichTelemetry(b),
      ]);
      expect(results.every((r) => r.attached === 1)).toBe(true);
      expect(
        await enrichTelemetry(
          batch([b.spans[0] ?? enrichment(), enrichment()]),
        ),
      ).toMatchObject({ attached: 0, unmatched: 1 });
      expect(
        (
          await database()`SELECT count(*)::int AS n FROM conversation_trace_event`
        )[0]?.n,
      ).toBe(1);
    });
    it("isolates ambiguous mappings and duplicate span IDs from valid siblings", async () => {
      await storeTelemetry(
        eventBatch([
          makeEvent(),
          makeEvent({ kind: "step_completed", attemptId: null }),
          makeEvent({ kind: "turn_completed", attemptId: null }),
        ]),
      );
      const step = enrichment({ kind: "step", turnId: "turn", stepIndex: 0 });
      expect(
        await enrichTelemetry(batch([enrichment(), enrichment(), step])),
      ).toMatchObject({ attached: 1, unmatched: 1 });
      const turn = enrichment({ kind: "turn", turnId: "turn" });
      const colliding = enrichment();
      colliding.span.spanId = step.span.spanId;
      expect(await enrichTelemetry(batch([colliding, turn]))).toMatchObject({
        attached: 1,
        unmatched: 1,
      });
      expect(
        (
          await database()`SELECT count(*)::int AS n FROM conversation_trace_event WHERE otel_span IS NOT NULL`
        )[0]?.n,
      ).toBe(2);
      // Two different targets in the same request must not claim the same native span.
      const another = enrichment({
        kind: "model",
        turnId: "turn",
        stepIndex: 1,
        purpose: "step",
      });
      another.span.spanId = colliding.span.spanId;
      expect(await enrichTelemetry(batch([colliding, another]))).toMatchObject({
        attached: 0,
        unmatched: 2,
      });
    });
    it("validates ownership for writes and reads, including suspension and revocation", async () => {
      await storeTelemetry(eventBatch([makeEvent()]));
      await expect(
        enrichTelemetry({ ...batch(), principalId: other }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        readTrace(other, "owned", "events", new URLSearchParams()),
      ).rejects.toMatchObject({ status: 404 });
      await database()`UPDATE evaluator SET enabled=false WHERE id=${owner}`;
      await expect(enrichTelemetry(batch())).rejects.toMatchObject({
        status: 404,
      });
      await database()`UPDATE evaluator SET enabled=true WHERE id=${owner}`;
      await database()`UPDATE evaluation_session SET revoked_at=now() WHERE session_id='owned'`;
      await expect(enrichTelemetry(batch())).rejects.toMatchObject({
        status: 404,
      });
    });
    it("refuses disabled/preview writes without changing existing telemetry", async () => {
      await storeTelemetry(eventBatch([makeEvent()]));
      vi.stubEnv("MOBAI_OTEL_ENABLED", "false");
      await expect(enrichTelemetry(batch())).rejects.toMatchObject({
        status: 404,
      });
      vi.stubEnv("MOBAI_OTEL_ENABLED", "true");
      vi.stubEnv("VERCEL_ENV", "preview");
      await expect(enrichTelemetry(batch())).rejects.toMatchObject({
        status: 404,
      });
      expect(
        (await database()`SELECT otel_span FROM conversation_trace_event`)[0]
          ?.otel_span,
      ).toBeNull();
    });
    it("inherits expiration and physical purge without extending retention", async () => {
      await storeTelemetry(eventBatch([makeEvent()]));
      await enrichTelemetry(batch());
      await database()`UPDATE conversation_trace_event SET expires_at=now()-interval '1 second'`;
      expect(await enrichTelemetry(batch())).toMatchObject({ attached: 0 });
      const page = (await readTrace(
        owner,
        "owned",
        "events",
        new URLSearchParams(),
      )) as { events: unknown[] };
      expect(page.events).toHaveLength(0);
      await pruneObservability();
      expect(
        (
          await database()`SELECT count(*)::int AS n FROM conversation_trace_event`
        )[0]?.n,
      ).toBe(0);
    });
    it("checks signed service scope and forbids browser-origin requests", async () => {
      await storeTelemetry(eventBatch([makeEvent()]));
      const b = batch();
      const token = async (scope: string) =>
        new SignJWT({ scope })
          .setProtectedHeader({ alg: "HS256" })
          .setIssuer("test")
          .setAudience("test")
          .setSubject("web")
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(new TextEncoder().encode(secret));
      const request = (auth = "", origin?: string) =>
        new Request("http://127.0.0.1/internal/telemetry", {
          method: "POST",
          body: JSON.stringify(b),
          headers: { authorization: auth, ...(origin ? { origin } : {}) },
        });
      expect((await POST(request())).status).toBe(401);
      expect(
        (await POST(request(`Bearer ${await token("mobility.read")}`))).status,
      ).toBe(403);
      const auth = `Bearer ${await token("mobility.telemetry.write")}`;
      expect((await POST(request(auth, "http://127.0.0.1:3000"))).status).toBe(
        403,
      );
      const result = await POST(request(auth));
      expect(result.status).toBe(200);
      expect(await result.json()).toMatchObject({ attached: 1 });
    });
  },
);
