import { describe, expect, it } from "vitest";
import {
  conversationMetric,
  type Metric,
  summarizeConversation,
} from "./conversation-metrics";

function metric(
  type: string,
  sequence: number,
  data = {},
  session = "s",
  turn = "t",
  time = sequence * 10,
): Metric {
  const result = conversationMetric(
    { type, data: { sequence, turnId: turn, ...data } },
    session,
    time,
  );
  if (!result) throw new Error("Invalid test metric");
  return result;
}
describe("conversation lifecycle telemetry", () => {
  it("allowlists numeric metadata and never includes content or provider errors", () => {
    const record = metric("step.failed", 1, {
      message: "secret",
      details: { apiKey: "secret" },
      prompt: "secret",
    });
    expect(JSON.stringify(record)).not.toContain("secret");
    expect(
      conversationMetric(
        { type: "message.completed", data: { message: "secret" } },
        "s",
      ),
    ).toBeNull();
  });
  it("keeps missing, invalid and zero usage distinct", () => {
    const record = metric("step.completed", 1, {
      usage: {
        inputTokens: 0,
        outputTokens: -1,
        cacheReadTokens: NaN,
        cacheWriteTokens: 1.5,
      },
    });
    expect(record.inputTokens).toBe(0);
    expect(record.outputTokens).toBeNull();
    expect(record.cacheReadTokens).toBeNull();
    expect(record.cacheWriteTokens).toBeNull();
  });
  it("deduplicates replay, separates sessions and aggregates turns without double-counting cache", () => {
    const a = metric("step.completed", 1, {
      usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 80 },
    });
    const b = metric(
      "step.completed",
      1,
      { usage: { inputTokens: 50 } },
      "s",
      "t2",
    );
    const c = metric("step.completed", 1, {}, "other");
    const summary = summarizeConversation([a, a, b, c]);
    const session = summary.find(
      (r) => r.sessionId === "s" && r.turnId === null,
    );
    expect(session).toMatchObject({
      stepsCompleted: 2,
      inputTokens: { reported: 150, missing: 0 },
      outputTokens: { reported: 10, missing: 1 },
      cacheReadTokens: { reported: 80, missing: 1 },
      providerAttempts: null,
    });
    expect(summary).toHaveLength(5);
  });
  it("measures observed turn latency and leaves interrupted turns incomplete", () => {
    const rows = [
      metric("turn.started", 0),
      metric("step.started", 1),
      metric("compaction.requested", 2),
      metric("compaction.completed", 3),
      metric("turn.cancelled", 4),
      metric("turn.started", 5, {}, "s", "t2"),
    ];
    expect(
      summarizeConversation(rows).find((r) => r.turnId === null),
    ).toMatchObject({
      completedTurnLatencyMs: 40,
      turnsWithUnknownLatency: 1,
      compactionsRequested: 1,
      compactionsCompleted: 1,
      stepsStarted: 1,
    });
  });
  it("uses durable EVE emission timestamps rather than replay arrival latency", () => {
    const start = conversationMetric(
      {
        type: "turn.started",
        meta: { at: "2026-09-25T09:00:00Z" },
        data: { turnId: "t", sequence: 0 },
      },
      "s",
      5000,
    );
    const end = conversationMetric(
      {
        type: "turn.completed",
        meta: { at: "2026-09-25T09:00:02Z" },
        data: { turnId: "t", sequence: 1 },
      },
      "s",
      5001,
    );
    if (!start || !end) throw new Error("Invalid fixtures");
    expect(summarizeConversation([start, end])[0]?.completedTurnLatencyMs).toBe(
      2000,
    );
  });
  it("rejects malformed identity metadata", () => {
    expect(
      conversationMetric(
        { type: "step.completed", data: { sequence: -1, turnId: "t" } },
        "s",
      ),
    ).toBeNull();
    expect(
      conversationMetric(
        { type: "step.completed", data: { sequence: 1 } },
        "s",
      ),
    ).toBeNull();
  });
});
