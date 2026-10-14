import {
  type OtelBatch,
  type OtelEnrichment,
  otelBatch,
  otelEnrichment,
  traceEnrichmentEnabled,
} from "@mobility/contracts";
import type { SpanExportPolicy, SpanProcessor } from "eve/instrumentation/otel";
import {
  onTerminalReady,
  telemetryPrincipal,
  terminalReady,
} from "./otel-coordination";

export const traceAttributeKeys = new Set([
  "agent.run.id",
  "agent.turn.id",
  "agent.step.index",
  "gen_ai.operation.name",
  "gen_ai.tool.call.id",
  "ai.settings.context.mobai.turn_id",
  "ai.settings.context.mobai.step_index",
  "ai.settings.context.mobai.purpose",
]);
export const traceExportPolicy: SpanExportPolicy = {
  span: () => ({ redact: true, inputs: true, outputs: true }),
  attribute: ({ key }) => ({ emit: traceAttributeKeys.has(key) }),
};
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
function time(v: unknown) {
  if (
    !Array.isArray(v) ||
    v.length !== 2 ||
    !v.every(Number.isSafeInteger) ||
    v[0] < 0 ||
    v[1] < 0 ||
    v[1] >= 1e9
  )
    return null;
  return v[0] * 1000 + v[1] / 1e6;
}

/** Allowlist the native EVE spans; ignore nested AI SDK spans, usage, bodies and errors. */
export function projectNativeSpan(value: unknown) {
  try {
    const s = record(value),
      a = record(s.attributes);
    if (
      record(s.instrumentationScope).name !== "eve.agent" ||
      record(s.instrumentationScope).version !== "0.65.0" ||
      typeof s.spanContext !== "function"
    )
      return null;
    const context = record(s.spanContext());
    if (typeof context.traceFlags !== "number" || !(context.traceFlags & 1))
      return null;
    const op = a["gen_ai.operation.name"];
    const target =
      op === "invoke_agent"
        ? { kind: "turn", turnId: a["agent.turn.id"] }
        : s.name === "agent.step"
          ? {
              kind: "step",
              turnId: a["agent.turn.id"],
              stepIndex: a["agent.step.index"],
            }
          : op === "chat"
            ? {
                kind: "model",
                turnId: a["ai.settings.context.mobai.turn_id"],
                stepIndex: a["ai.settings.context.mobai.step_index"],
                purpose: a["ai.settings.context.mobai.purpose"],
              }
            : op === "execute_tool"
              ? { kind: "tool", callId: a["gen_ai.tool.call.id"] }
              : null;
    if (!target) return null;
    const started = time(s.startTime),
      ended = time(s.endTime),
      duration = time(s.duration);
    if (started === null || ended === null || duration === null) return null;
    const span = otelEnrichment.parse({
      target,
      span: {
        source: "eve@0.65.0",
        kind: target.kind,
        traceId: context.traceId,
        spanId: context.spanId,
        parentSpanId: record(s.parentSpanContext).spanId ?? null,
        startedAt: new Date(started).toISOString(),
        endedAt: new Date(ended).toISOString(),
        durationMs: duration,
      },
    });
    const sessionId = otelBatch.shape.sessionId.parse(a["agent.run.id"]);
    return { sessionId, enrichment: span };
  } catch {
    return null;
  }
}

async function send(batch: OtelBatch) {
  try {
    const base = process.env.MOBILITY_MCP_URL,
      token = process.env.MOBILITY_MCP_TOKEN;
    if (!base || !token || !traceEnrichmentEnabled(process.env)) return;
    const url = new URL("/internal/telemetry", base);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      )
    )
      return;
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(otelBatch.parse(batch)),
      signal: AbortSignal.timeout(200),
    });
    await response.body?.cancel();
  } catch {
    /* Never retry, log provider material, or influence inference. */
  }
}

/** Bounded metadata-only enrichment, not a second event producer or OTLP endpoint. */
export function createTraceEnrichmentProcessor(
  options: {
    enabled?: () => boolean;
    principal?: (session: string) => string | undefined;
    send?: (batch: OtelBatch) => Promise<void>;
    ready?: (session: string, target: OtelEnrichment["target"]) => boolean;
  } = {},
): SpanProcessor {
  const enabled =
    options.enabled ?? (() => traceEnrichmentEnabled(process.env));
  const principal = options.principal ?? telemetryPrincipal;
  const deliver = options.send ?? send;
  const ready = options.ready ?? terminalReady;
  let queue: {
    sessionId: string;
    enrichment: OtelEnrichment;
    queuedAt: number;
  }[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing: Promise<void> | undefined;
  let closed = false;
  const unsubscribe = onTerminalReady(schedule);
  function schedule() {
    if (!timer && !closed && queue.length) {
      timer = setTimeout(() => {
        timer = undefined;
        void flush();
      }, 50);
      timer.unref?.();
    }
  }
  async function flush() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (flushing) {
      await flushing;
      if (queue.some((v) => ready(v.sessionId, v.enrichment.target)))
        await flush();
      return;
    }
    // Rendezvous with Core's acknowledgement, regardless of arrival order.
    queue = queue.filter((v) => v.queuedAt > Date.now() - 30_000);
    const pending = queue.filter((v) =>
      ready(v.sessionId, v.enrichment.target),
    );
    queue = queue.filter((v) => !ready(v.sessionId, v.enrichment.target));
    if (!enabled()) {
      queue = [];
      return;
    }
    flushing = (async () => {
      const batches: OtelBatch[] = [];
      for (const item of pending) {
        const owner = principal(item.sessionId);
        if (!owner) continue; // Ownership comes only from the existing authenticated hook.
        let batch = batches.find(
          (b) => b.sessionId === item.sessionId && b.spans.length < 32,
        );
        if (!batch) {
          if (batches.length === 8) continue;
          batch = {
            schemaVersion: 1,
            type: "otel_enrichment",
            principalId: owner,
            sessionId: item.sessionId,
            spans: [],
          };
          batches.push(batch);
        }
        batch.spans.push(item.enrichment);
      }
      // At most two in-flight requests, eight batches and 128 small records per drain.
      for (let i = 0; i < batches.length; i += 2)
        await Promise.all(
          batches.slice(i, i + 2).map(async (b) => {
            try {
              await deliver(b);
            } catch {
              /* Fail open, no replay. */
            }
          }),
        );
    })()
      .catch(() => {})
      .finally(() => {
        flushing = undefined;
        if (queue.some((v) => ready(v.sessionId, v.enrichment.target)))
          schedule();
      });
    await flushing;
  }
  return {
    onStart() {},
    onEnd(value) {
      try {
        queue = queue.filter((v) => v.queuedAt > Date.now() - 30_000);
        if (closed || !enabled() || queue.length >= 128) return;
        const projected = projectNativeSpan(value);
        if (!projected) return;
        queue.push({ ...projected, queuedAt: Date.now() });
        schedule();
      } catch {
        /* Instrumentation must not fail the agent. */
      }
    },
    forceFlush: flush,
    async shutdown() {
      closed = true;
      unsubscribe();
      await flush();
      queue = [];
    },
  };
}
