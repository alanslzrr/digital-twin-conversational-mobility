/** Numeric lifecycle telemetry only. Never serialize EVE event payloads wholesale. */
export const metricEvents = new Set([
  "turn.started",
  "turn.completed",
  "turn.failed",
  "turn.cancelled",
  "step.started",
  "step.completed",
  "step.failed",
  "compaction.requested",
  "compaction.completed",
]);
export type Metric = {
  schema: 1;
  sessionId: string;
  turnId: string;
  sequence: number;
  event: string;
  observedAtMs: number;
  emittedAtMs: number | null;
  stopReason: string | null;
  stepIndex: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
};
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}
export function conversationMetric(
  event: unknown,
  sessionId: string,
  observedAtMs = Date.now(),
): Metric | null {
  const envelope = object(event);
  if (typeof envelope.type !== "string" || !metricEvents.has(envelope.type))
    return null;
  const data = object(envelope.data);
  const sequence = count(data.sequence);
  if (
    sequence === null ||
    typeof data.turnId !== "string" ||
    !Number.isFinite(observedAtMs)
  )
    return null;
  const usage = envelope.type === "step.completed" ? object(data.usage) : {};
  return {
    schema: 1,
    sessionId,
    turnId: data.turnId,
    sequence,
    event: envelope.type,
    observedAtMs,
    emittedAtMs:
      typeof object(envelope.meta).at === "string" &&
      Number.isFinite(Date.parse(String(object(envelope.meta).at)))
        ? Date.parse(String(object(envelope.meta).at))
        : null,
    stopReason: envelope.type.endsWith("failed")
      ? "failed"
      : envelope.type === "turn.cancelled"
        ? "cancelled"
        : envelope.type === "step.completed" &&
            [
              "stop",
              "length",
              "tool-calls",
              "content-filter",
              "error",
              "other",
            ].includes(String(data.finishReason))
          ? String(data.finishReason)
          : null,
    stepIndex: count(data.stepIndex),
    inputTokens: count(usage.inputTokens),
    outputTokens: count(usage.outputTokens),
    cacheReadTokens: count(usage.cacheReadTokens),
    cacheWriteTokens: count(usage.cacheWriteTokens),
  };
}

/** Offline aggregation: event replay is deduplicated; absent usage is not zero. */
export function summarizeConversation(metrics: readonly Metric[]) {
  const seen = new Set<string>();
  const groups = new Map<
    string,
    { sessionId: string; turnId: string | null; records: Metric[] }
  >();
  for (const metric of metrics) {
    const id = JSON.stringify([
      metric.sessionId,
      metric.turnId,
      metric.sequence,
      metric.event,
    ]);
    if (seen.has(id)) continue;
    seen.add(id);
    for (const turnId of [metric.turnId, null]) {
      const key = JSON.stringify([metric.sessionId, turnId]);
      const group = groups.get(key) ?? {
        sessionId: metric.sessionId,
        turnId,
        records: [],
      };
      group.records.push(metric);
      groups.set(key, group);
    }
  }
  return [...groups.values()].map(({ sessionId, turnId, records }) => {
    const completed = records.filter((r) => r.event === "step.completed");
    const totals = (
      field:
        | "inputTokens"
        | "outputTokens"
        | "cacheReadTokens"
        | "cacheWriteTokens",
    ) => ({
      reported: completed.reduce((sum, r) => sum + (r[field] ?? 0), 0),
      missing: completed.filter((r) => r[field] === null).length,
    });
    const starts = records.filter((r) => r.event === "turn.started");
    const ends = records.filter((r) =>
      ["turn.completed", "turn.failed", "turn.cancelled"].includes(r.event),
    );
    const durations = starts.map((start) => {
      const end = ends.find(
        (r) => r.turnId === start.turnId && r.sequence >= start.sequence,
      );
      const from = start.emittedAtMs ?? start.observedAtMs;
      const to = end ? (end.emittedAtMs ?? end.observedAtMs) : null;
      return to !== null && to >= from ? to - from : null;
    });
    return {
      sessionId,
      turnId,
      stepsStarted: records.filter((r) => r.event === "step.started").length,
      stepsCompleted: completed.length,
      stepsFailed: records.filter((r) => r.event === "step.failed").length,
      compactionsRequested: records.filter(
        (r) => r.event === "compaction.requested",
      ).length,
      compactionsCompleted: records.filter(
        (r) => r.event === "compaction.completed",
      ).length,
      inputTokens: totals("inputTokens"),
      outputTokens: totals("outputTokens"),
      cacheReadTokens: totals("cacheReadTokens"),
      cacheWriteTokens: totals("cacheWriteTokens"),
      completedTurnLatencyMs: durations.reduce<number>(
        (sum, ms) => sum + (ms ?? 0),
        0,
      ),
      turnsWithUnknownLatency: durations.filter((ms) => ms === null).length,
      // Steps are NOT provider attempts. Compaction/retries need transport telemetry.
      providerAttempts: null,
    };
  });
}
