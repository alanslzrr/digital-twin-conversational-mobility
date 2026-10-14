import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { OtelBatch } from "@mobility/contracts";
import { otelIntegration } from "eve/instrumentation/otel";
import { afterEach, expect, it, vi } from "vitest";
import agentRuns from "../agent/instrumentation/agent-runs";
import local from "../agent/instrumentation/local";
import settings from "../agent/instrumentation/otel";
import {
  createTraceEnrichmentProcessor,
  traceExportPolicy,
} from "./otel-enrichment";

// Tests alone use pinned internals to exercise the actual EVE span producer.
// Production imports only the public instrumentation surface.
const root = dirname(createRequire(import.meta.url).resolve("eve"));
const load = (path: string) => import(pathToFileURL(resolve(root, path)).href);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each(["completed", "failed", "cancelled"] as const)(
  "EVE 0.65.0 traces %s with the installed producer, without models or exporters",
  async (outcome) => {
    expect(
      JSON.parse(readFileSync(resolve(root, "../../package.json"), "utf8"))
        .version,
    ).toBe("0.65.0");
    const [
      { registerOtelPipeline },
      { createAgentOtelInstrumentation },
      { InMemoryAgentTraceStateStore },
      { collectOtelPipeline },
      api,
    ] = await Promise.all([
      load("tracing/otel-registration.js"),
      load("tracing/agent-otel-provider.js"),
      load("tracing/agent-trace-state.js"),
      load("tracing/otel-declaration.js"),
      load("compiled/@opentelemetry/api/index.js"),
    ]);
    const network = vi.fn(() => {
      throw Error("Network forbidden in compatibility test");
    });
    vi.stubGlobal("fetch", network);
    const batches: OtelBatch[] = [];
    const processor = createTraceEnrichmentProcessor({
      enabled: () => true,
      principal: () => "11111111-1111-4111-8111-111111111111",
      ready: () => true,
      send: async (b) => {
        batches.push(b);
      },
    });
    const collected = collectOtelPipeline([
      settings,
      otelIntegration({
        spanProcessors: [processor],
        exportPolicy: traceExportPolicy,
      }),
    ]);
    const pipeline = registerOtelPipeline({
      serviceName: "mobai-offline-test",
      pipeline: collected.pipeline,
    });
    try {
      for (const enabled of [false, true]) {
        vi.stubEnv("MOBAI_OTEL_ENABLED", String(enabled));
        const native = createAgentOtelInstrumentation({
          frameworkVersion: "0.65.0",
          environment: "production",
          recordInputs: collected.settings.recordInputs,
          recordOutputs: collected.settings.recordOutputs,
          tracePolicy: collected.settings.tracePolicy,
          stateStore: new InMemoryAgentTraceStateStore(),
          idGenerator: pipeline.idGenerator,
          tracer: api.trace.getTracer("eve.agent", "0.65.0"),
        });
        const sessionId = `native-${outcome}-${enabled}`,
          turnId = "native-turn";
        const fire = async (type: string, fields: Record<string, unknown>) => {
          const e = await native.hook.projectEvent({ type, ...fields });
          await native.hook.events[type](e, {});
        };
        const session = {
          sessionId,
          rootSessionId: sessionId,
          agentName: "mobai",
          idempotencyKey: sessionId,
          channelAudience: "private",
          channelKind: "web",
        };
        await fire("session.started", session);
        await fire("turn.started", {
          ...session,
          turnId,
          sequence: 0,
          idempotencyKey: `${sessionId}:turn`,
        });
        const scope = {
          sessionId,
          rootSessionId: sessionId,
          turnId,
          stepIndex: 0,
          attemptIndex: 0,
          attemptId: `${sessionId}:attempt`,
          functionId: "mobai",
          channelAudience: "private",
        };
        const runtimeContext = {
          "mobai.turn_id": turnId,
          "mobai.step_index": 0,
          "mobai.purpose": outcome === "cancelled" ? "compaction" : "step",
        };
        await fire("step.attempt.started", {
          scope,
          runtimeContext,
          idempotencyKey: `${sessionId}:step`,
          operation: {
            modelId: "fixture",
            operationId: "generate",
            provider: "fixture",
          },
        });
        await fire("model.call.started", {
          scope,
          runtimeContext,
          idempotencyKey: `${sessionId}:model`,
          model: { modelId: "fixture", provider: "fixture" },
          input: { messages: ["private"] },
        });
        await fire(
          outcome === "completed"
            ? "model.call.completed"
            : "model.call.failed",
          {
            scope,
            idempotencyKey: `${sessionId}:model`,
            error: new Error("private upstream failure"),
            finishReason: "stop",
            usage: { inputTokens: 99, outputTokens: 10 },
            content: [{ type: "text", text: "private output" }],
          },
        );
        await fire("tool.call.started", {
          scope,
          idempotencyKey: `${sessionId}:tool`,
          callId: "call1",
          toolName: "mobility__resolve_place",
          input: "private address",
        });
        await fire(
          outcome === "completed" ? "tool.call.completed" : "tool.call.failed",
          {
            scope,
            idempotencyKey: `${sessionId}:tool`,
            error: new Error("private tool failure"),
            output: { type: "result", output: "private place" },
          },
        );
        await fire(
          outcome === "completed"
            ? "step.attempt.completed"
            : "step.attempt.failed",
          {
            scope,
            idempotencyKey: `${sessionId}:step`,
            error: new Error("private step failure"),
          },
        );
        await fire(`turn.${outcome}`, {
          sessionId,
          turnId,
          idempotencyKey: `${sessionId}:turn`,
          error: new Error("private turn failure"),
        });
        await fire("session.completed", {
          sessionId,
          turnId,
          idempotencyKey: sessionId,
        });
        await pipeline.forceFlush();
        if (!enabled) expect(batches).toHaveLength(0);
      }
      const spans = batches.flatMap((b) => b.spans);
      expect(spans.map((s) => s.span.kind).sort()).toEqual([
        "model",
        "step",
        "tool",
        "turn",
      ]);
      expect(new Set(spans.map((s) => s.span.traceId)).size).toBe(1);
      expect(spans.find((s) => s.span.kind === "model")?.target).toEqual({
        kind: "model",
        turnId: "native-turn",
        stepIndex: 0,
        purpose: outcome === "cancelled" ? "compaction" : "step",
      });
      expect(JSON.stringify(batches)).not.toMatch(
        /private|inputTokens|outputTokens/,
      );
      expect(network).not.toHaveBeenCalled();
      expect(local).toEqual(agentRuns);
      expect(settings.options.propagators).toEqual(["none"]);
      expect(settings.options.instrumentations).toEqual([]);
    } finally {
      await pipeline.shutdown();
      api.trace.disable();
      api.propagation.disable();
      api.context.disable();
    }
  },
);
