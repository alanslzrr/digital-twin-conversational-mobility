import { z } from "zod";
import { conversationPage } from "./conversations";
import { dashboardData, dashboardToolName } from "./dashboard";
import {
  telemetryEvent,
  telemetryProjection,
  telemetryToolName,
} from "./telemetry";

const time = z.iso.datetime({ offset: true }).nullable();
const count = z.number().int().nonnegative();
const nullableCount = count.nullable();
const coverage = z.strictObject({
  value: nullableCount,
  reported: count,
  observed: count,
  partial: z.boolean(),
});
export const dashboardReportedUsage = z.strictObject({
  inputTokens: nullableCount,
  outputTokens: nullableCount,
  cachedInputTokens: nullableCount,
  reasoningTokens: nullableCount,
  totalTokens: nullableCount,
  coverage: z.strictObject({
    input: coverage,
    output: coverage,
    cache: coverage,
    reasoning: coverage,
    total: coverage.omit({ value: true }),
  }),
});
export const dashboardConversationSummary = z.union([
  z.strictObject({
    captureStatus: z.literal("not_instrumented"),
    warning: z.string().max(1000),
  }),
  z.strictObject({
    state: z.string().max(40),
    captureStatus: z.string().max(40),
    captureVersion: count,
    captureStartedAt: time,
    firstObservedAt: time,
    lastObservedAt: time,
    eventCount: count,
    omittedEvents: count,
    knownGaps: count,
    retainedBytes: count,
    counts: z.strictObject({
      attempts: count,
      dispatched: count,
      tools: count,
      toolRequested: count,
      toolExecuted: count,
      toolFailed: count,
      toolRejected: count,
      toolCancelled: count,
      toolPending: count,
      missing: count,
      compactions: count,
    }),
    turns: z
      .array(
        dashboardReportedUsage.extend({
          turnId: z.string().max(160),
          attempts: count,
          state: z.string().max(40),
          durationMs: z.number().nonnegative().nullable(),
          startedAt: time,
        }),
      )
      .max(50),
    totalTurns: count,
    nextTurnCursor: z.string().max(4096).nullable(),
    limits: z.strictObject({
      sessionBytes: count,
      evaluatorBytes: count,
      sessionEvents: count,
      retentionDays: count,
    }),
    usage: dashboardReportedUsage,
    warning: z.string().max(1000),
  }),
]);
export const dashboardTracePage = z.strictObject({
  events: z
    .array(
      telemetryEvent
        .omit({ sequence: true, errorCode: true, usage: true })
        .extend({
          id: z.string().regex(/^\d+$/),
          inputTokens: nullableCount,
          outputTokens: nullableCount,
          cachedInputTokens: nullableCount,
          reasoningTokens: nullableCount,
          toolIdentity: z
            .strictObject({
              runtimeName: telemetryToolName,
              canonicalName: dashboardToolName.nullable(),
              family: z.enum(["mobility", "discovery"]),
            })
            .nullable(),
        }),
    )
    .max(100),
  nextCursor: z.string().max(4096).nullable(),
});
export const dashboardConversationSummaryResponse = dashboardData.extend({
  data: dashboardConversationSummary,
});
export const dashboardTraceResponse = dashboardData.extend({
  data: dashboardTracePage,
});
export const dashboardTracePayload = z.strictObject({
  kind: z.enum(["model_input", "model_output", "tool_input", "tool_output"]),
  content: telemetryProjection,
  capturedAt: time,
  recordedAt: time,
  originalBytes: count,
  retainedBytes: count,
  redacted: z.boolean(),
  truncated: z.boolean(),
  captureStatus: z.enum(["captured", "partial", "missing", "omitted"]),
  expiresAt: time,
});
export const dashboardTracePayloadResponse = dashboardData.extend({
  data: dashboardTracePayload,
});

export const dashboardConversationIndex = z.strictObject({
  sessions: z
    .array(
      conversationPage.shape.sessions.element.extend({
        lastActivityAt: time,
        captureStatus: z.enum(["best_effort", "partial", "not_instrumented"]),
        eventCount: count.nullable(),
      }),
    )
    .max(20),
  nextCursor: z.string().max(4096).nullable(),
});
export const dashboardConversationIndexResponse = dashboardData.extend({
  data: dashboardConversationIndex,
});
