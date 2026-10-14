import { describe, expect, it } from "vitest";
import {
  mergeTraceEvents,
  projectTrace,
  type TraceEvent,
  traceBar,
  visibleTraceRows,
} from "./trace-waterfall";

export function fixture(overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    id: "1",
    eventKey: "event.1",
    kind: "turn_completed",
    occurredAt: "2026-10-14T10:00:02.000Z",
    turnId: "turn1",
    stepIndex: null,
    purpose: null,
    attemptId: null,
    callId: null,
    tool: null,
    toolIdentity: null,
    providerResponseId: null,
    status: "succeeded",
    durationMs: 2000,
    isError: false,
    inputTokens: null,
    outputTokens: null,
    cachedInputTokens: null,
    reasoningTokens: null,
    payloadIds: [],
    sentCallIds: [],
    captureStatus: "captured",
    otel: null,
    ...overrides,
  };
}
function span(
  kind: "turn" | "step" | "model" | "tool",
  id: string,
  parent: string | null = null,
  trace = "a".repeat(32),
) {
  return {
    source: "eve@0.65.0" as const,
    kind,
    traceId: trace,
    spanId: id,
    parentSpanId: parent,
    startedAt: "2026-10-14T10:00:00.000Z",
    endedAt: "2026-10-14T10:00:02.000Z",
    durationMs: 2000,
  };
}
const turn = fixture({ otel: span("turn", "1".repeat(16)) });
const step = fixture({
  id: "2",
  kind: "step_completed",
  stepIndex: 0,
  otel: span("step", "2".repeat(16), "1".repeat(16)),
});
const model = fixture({
  id: "3",
  kind: "attempt_completed",
  stepIndex: 0,
  attemptId: "attempt1",
  inputTokens: 100,
  outputTokens: 10,
  cachedInputTokens: 50,
  reasoningTokens: 2,
  otel: span("model", "3".repeat(16), "2".repeat(16)),
});
const tool = fixture({
  id: "4",
  kind: "tool_result",
  stepIndex: 0,
  callId: "call1",
  tool: "resolve_address",
  otel: span("tool", "4".repeat(16), "9".repeat(16)),
});

describe("retained event waterfall projection", () => {
  it("merges lifecycle events and deduplicates pages, not usage or evidence", () => {
    const dispatched = fixture({
      ...model,
      id: "5",
      kind: "attempt_dispatched",
      otel: null,
      inputTokens: null,
      outputTokens: null,
    });
    const rows = projectTrace([model, dispatched, model]).operations;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.events).toHaveLength(2);
    expect(rows[0]?.event).toBe(model);
    expect(rows[0]?.event.inputTokens).toBe(100);
    expect(rows[0]?.span?.durationMs).toBe(2000);
  });
  it("prefers newly enriched copies of the same id across pages", () => {
    expect(mergeTraceEvents([{ ...model, otel: null }], [model])).toEqual([
      model,
    ]);
  });
  it("uses native parents within the same trace and logical groups for absent tool parents", () => {
    const result = projectTrace([tool, model, step, turn]);
    expect(result.roots).toHaveLength(1);
    expect(result.operations.find((o) => o.kind === "model")?.relation).toBe(
      "native",
    );
    const row = result.operations.find((o) => o.kind === "tool");
    expect(row?.parent).toBe("step:turn1:0");
    expect(row?.relation).toBe("logical");
    expect(row?.span?.parentSpanId).toBe("9".repeat(16));
    expect(result.end - result.start).toBe(2000); // Not 4 * 2000.
  });
  it("never links identical span ids across distinct traces", () => {
    const otherTrace = {
      ...model,
      otel: span("model", "3".repeat(16), "2".repeat(16), "b".repeat(32)),
    };
    expect(
      projectTrace([step, otherTrace]).operations.find(
        (o) => o.kind === "model",
      )?.relation,
    ).toBe("logical");
  });
  it("keeps retries and compactions separate, never matches anonymous preparations by position", () => {
    const result = projectTrace([
      model,
      { ...model, id: "7", attemptId: "retry" },
      { ...model, id: "8", attemptId: "compaction", purpose: "compaction" },
      fixture({ id: "9", kind: "attempt_prepared", stepIndex: 0 }),
    ]);
    expect(result.operations).toHaveLength(4);
  });
  it("shows a point, not an inferred interval, without OTel; preserves unknown usage", () => {
    const result = projectTrace([
      fixture({
        kind: "attempt_failed",
        attemptId: "a",
        durationMs: 750,
        status: "failed",
      }),
    ]);
    const row = result.operations[0];
    expect(row?.end).toBe(row?.start);
    expect(row?.span).toBeNull();
    expect(row?.event.inputTokens).toBeNull();
    expect(row?.event.durationMs).toBe(750);
    expect(row?.terminal).toBe(true);
  });
  it("does not turn old start-only operations into live durations", () => {
    const row = projectTrace([
      fixture({ kind: "turn_started", status: "running", durationMs: null }),
    ]).operations[0];
    expect(row?.terminal).toBe(false);
    expect(row?.end).toBe(row?.start);
  });
  it("keeps orphan operations as roots instead of inventing spans", () => {
    const result = projectTrace([model]);
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]?.relation).toBe("root");
  });
  it("refuses cyclic or ambiguous native ancestry", () => {
    const cyclic = {
      ...turn,
      otel: span("turn", "1".repeat(16), "3".repeat(16)),
    };
    const duplicate = { ...step, id: "9", turnId: "different" };
    const result = projectTrace([cyclic, step, duplicate, model]);
    expect(result.roots.some((o) => o.kind === "turn")).toBe(true);
    expect(result.operations.find((o) => o.kind === "model")?.relation).toBe(
      "logical",
    );
  });
  it("preserves ancestors of search matches even when collapsed", () => {
    const tree = projectTrace([turn, step, tool]);
    const collapsed = new Set(["turn:turn1"]);
    expect(
      visibleTraceRows(
        tree.roots,
        collapsed,
        "",
        (o) => o.event.tool ?? o.kind,
      ),
    ).toHaveLength(1);
    const matches = visibleTraceRows(
      tree.roots,
      collapsed,
      "resolve",
      (o) => o.event.tool ?? o.kind,
    );
    expect(matches.map((r) => r.depth)).toEqual([0, 1, 2]);
    expect(
      visibleTraceRows(tree.roots, collapsed, "missing", (o) => o.kind),
    ).toEqual([]);
  });
  it("clips zoomed intervals and handles zero-duration and empty traces", () => {
    expect(traceBar({ start: 50, end: 150 }, 100, 200)).toEqual({
      left: 0,
      width: 50,
    });
    expect(traceBar({ start: 0, end: 10 }, 100, 200)).toBeNull();
    expect(traceBar({ start: 100, end: 100 }, 100, 100)).toEqual({
      left: 0,
      width: 0,
    });
    expect(projectTrace([])).toEqual({
      operations: [],
      roots: [],
      start: 0,
      end: 0,
    });
  });
  it("sorts large database ids without precision loss and does not mutate source", () => {
    const a = fixture({ id: "90071992547409930" }),
      b = fixture({ id: "90071992547409931" });
    const input = [b, a];
    expect(mergeTraceEvents(input).map((e) => e.id)).toEqual([a.id, b.id]);
    expect(input[0]).toBe(b);
  });
});
