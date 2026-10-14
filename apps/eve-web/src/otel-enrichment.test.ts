import { randomUUID } from "node:crypto";
import {
  type OtelBatch,
  otelBatch,
  traceEnrichmentEnabled,
} from "@mobility/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acknowledgeTerminals } from "./otel-coordination";
import {
  createTraceEnrichmentProcessor,
  projectNativeSpan,
} from "./otel-enrichment";
import { bindTelemetry, event, sendTelemetry } from "./telemetry";

const owner = randomUUID();
function native(extra: Record<string, unknown> = {}) {
  return {
    name: "chat fixture",
    instrumentationScope: { name: "eve.agent", version: "0.65.0" },
    spanContext: () => ({
      traceId: "a".repeat(32),
      spanId: "b".repeat(16),
      traceFlags: 1,
    }),
    parentSpanContext: { spanId: "c".repeat(16) },
    startTime: [1700000000, 0],
    endTime: [1700000000, 250000000],
    duration: [0, 250000000],
    attributes: {
      "agent.run.id": "session",
      "gen_ai.operation.name": "chat",
      "ai.settings.context.mobai.turn_id": "turn",
      "ai.settings.context.mobai.step_index": 0,
      "ai.settings.context.mobai.purpose": "step",
      "gen_ai.input.messages": "private prompt",
      "gen_ai.usage.input_tokens": 999,
      authorization: "synthetic-secret",
    },
    status: { code: 2, message: "private failure" },
    events: [{ name: "exception", attributes: { private: "text" } }],
    ...extra,
  };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("native OTel enrichment", () => {
  it("defaults off; refuses previews and non-exact flags", () => {
    for (const env of [
      {},
      { MOBAI_OTEL_ENABLED: "1" },
      { MOBAI_OTEL_ENABLED: "true", VERCEL_ENV: "preview" },
      { MOBAI_OTEL_ENABLED: "true", DEPLOYMENT_ENV: "preview" },
    ])
      expect(traceEnrichmentEnabled(env)).toBe(false);
    expect(traceEnrichmentEnabled({ MOBAI_OTEL_ENABLED: "true" })).toBe(true);
  });
  it("retains closed metadata only, never duplicates content/usage or nested SDK spans", () => {
    const p = projectNativeSpan(native());
    expect(p?.enrichment.target).toEqual({
      kind: "model",
      turnId: "turn",
      stepIndex: 0,
      purpose: "step",
    });
    expect(p?.enrichment.span.durationMs).toBe(250);
    expect(JSON.stringify(p)).not.toMatch(
      /private|secret|999|authorization|exception/,
    );
    expect(
      projectNativeSpan(native({ instrumentationScope: { name: "ai" } })),
    ).toBeNull();
    expect(projectNativeSpan(native({ attributes: {} }))).toBeNull();
    expect(projectNativeSpan(native({ endTime: [NaN, 0] }))).toBeNull();
    expect(
      projectNativeSpan(
        native({ spanContext: () => ({ traceId: "0".repeat(32) }) }),
      ),
    ).toBeNull();
    expect(
      projectNativeSpan(
        native({
          spanContext: () => {
            throw Error("private");
          },
        }),
      ),
    ).toBeNull();
  });
  it("rejects payload, usage and arbitrary attributes in the Core contract", () => {
    const p = projectNativeSpan(native());
    const batch = {
      schemaVersion: 1,
      type: "otel_enrichment",
      principalId: owner,
      sessionId: "session",
      spans: [p?.enrichment],
    };
    expect(otelBatch.safeParse(batch).success).toBe(true);
    expect(otelBatch.safeParse({ ...batch, payloads: [] }).success).toBe(false);
    expect(
      otelBatch.safeParse({
        ...batch,
        spans: [{ ...p?.enrichment, usage: 12 }],
      }).success,
    ).toBe(false);
  });
  it("does not emit while off and drains at most 128 records with two requests in flight", async () => {
    const send = vi.fn(async () => {});
    const off = createTraceEnrichmentProcessor({ enabled: () => false, send });
    off.onEnd(native());
    await off.shutdown();
    expect(send).not.toHaveBeenCalled();
    let active = 0,
      high = 0;
    const batches: OtelBatch[] = [];
    const processor = createTraceEnrichmentProcessor({
      enabled: () => true,
      principal: () => owner,
      ready: () => true,
      send: async (batch) => {
        active++;
        high = Math.max(high, active);
        batches.push(batch);
        await Promise.resolve();
        active--;
      },
    });
    for (let i = 0; i < 200; i++) processor.onEnd(native());
    await processor.forceFlush();
    await processor.shutdown();
    expect(batches.flatMap((b) => b.spans)).toHaveLength(128);
    expect(batches.every((b) => b.spans.length <= 32)).toBe(true);
    expect(high).toBeLessThanOrEqual(2);
  });
  it.each(["span-first", "event-first"])(
    "rendezvous handles %s without a second event or missing INSERT race",
    async (order) => {
      vi.stubEnv("MOBAI_OTEL_ENABLED", "true");
      const session = `s-${randomUUID()}`;
      const send = vi.fn(async () => {});
      const p = createTraceEnrichmentProcessor({
        principal: () => owner,
        send,
      });
      const terminal = event({
        eventKey: "terminal",
        kind: "attempt_completed",
        status: "succeeded",
        turnId: "turn",
        stepIndex: 0,
        purpose: "step",
        attemptId: randomUUID(),
      });
      const span = native();
      span.attributes["agent.run.id"] = session;
      if (order === "event-first")
        acknowledgeTerminals(session, [terminal], ["terminal"]);
      p.onEnd(span);
      await p.forceFlush();
      if (order === "span-first") {
        expect(send).not.toHaveBeenCalled();
        acknowledgeTerminals(session, [terminal], []);
        await p.forceFlush();
        expect(send).not.toHaveBeenCalled();
        acknowledgeTerminals(session, [terminal], ["terminal"]);
        await p.forceFlush();
      }
      expect(send).toHaveBeenCalledOnce();
      await p.shutdown();
    },
  );
  it("drops unknown owners, expiration, excess groups and failed delivery without retry", async () => {
    const send = vi.fn(async () => {
      throw new Error("unavailable");
    });
    const p = createTraceEnrichmentProcessor({
      enabled: () => true,
      principal: () => undefined,
      ready: () => true,
      send,
    });
    p.onEnd(native());
    await p.shutdown();
    expect(send).not.toHaveBeenCalled();
    const failing = createTraceEnrichmentProcessor({
      enabled: () => true,
      principal: () => owner,
      ready: () => true,
      send,
    });
    failing.onEnd(native());
    await failing.forceFlush();
    await failing.shutdown();
    expect(send).toHaveBeenCalledOnce();
    vi.useFakeTimers();
    const expired = createTraceEnrichmentProcessor({
      enabled: () => true,
      principal: () => owner,
      ready: () => false,
      send,
    });
    expired.onEnd(native());
    await expired.forceFlush();
    vi.setSystemTime(Date.now() + 31_000);
    await expired.shutdown();
    expect(send).toHaveBeenCalledOnce();
  });
  it("sends only to the fixed Core sink and never follows a redirect", async () => {
    vi.stubEnv("MOBAI_OTEL_ENABLED", "true");
    vi.stubEnv("MOBILITY_MCP_URL", "http://127.0.0.1:3001/mcp");
    vi.stubEnv("MOBILITY_MCP_TOKEN", "synthetic-only");
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response("", {
          status: 307,
          headers: { location: "https://example.invalid" },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const p = createTraceEnrichmentProcessor({
      principal: () => owner,
      ready: () => true,
    });
    p.onEnd(native());
    await p.shutdown();
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:3001/internal/telemetry",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      redirect: "error",
      method: "POST",
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("requires an accepted terminal acknowledgement from the existing HTTP transport", async () => {
    vi.stubEnv("MOBAI_OTEL_ENABLED", "true");
    vi.stubEnv("MOBILITY_MCP_URL", "http://127.0.0.1:3001/mcp");
    vi.stubEnv("MOBILITY_MCP_TOKEN", "synthetic-only");
    const session = randomUUID();
    await bindTelemetry(owner, session);
    const deliver = vi.fn(async (_batch: OtelBatch) => {});
    const p = createTraceEnrichmentProcessor({ send: deliver });
    const span = native();
    span.attributes["agent.run.id"] = session;
    const terminal = event({
      eventKey: "terminal",
      kind: "attempt_completed",
      status: "succeeded",
      turnId: "turn",
      stepIndex: 0,
      purpose: "step",
      attemptId: randomUUID(),
    });
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);
    try {
      p.onEnd(span);
      fetch.mockResolvedValueOnce(Response.json({ accepted: false }));
      await sendTelemetry(owner, session, [terminal]);
      await p.forceFlush();
      expect(deliver).not.toHaveBeenCalled();
      fetch.mockResolvedValueOnce(
        Response.json({ accepted: true, acknowledged: ["terminal"] }),
      );
      await sendTelemetry(owner, session, [terminal]);
      await p.forceFlush();
      expect(deliver).toHaveBeenCalledOnce();
      expect(deliver.mock.calls[0]?.[0]).toMatchObject({
        principalId: owner,
        sessionId: session,
      });
    } finally {
      await p.shutdown();
    }
  });
});
