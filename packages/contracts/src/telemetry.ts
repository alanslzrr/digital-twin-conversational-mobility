import { z } from "zod";
import { conversationSessionId } from "./conversations";
import { dashboardLimits, dashboardToolName } from "./dashboard";

const timestamp = z.iso.datetime({ offset: true });
const key = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_.:-]+$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const telemetryUsage = z
  .strictObject({
    inputTokens: count.nullable(),
    outputTokens: count.nullable(),
    cachedInputTokens: count.nullable(),
    reasoningTokens: count.nullable(),
  })
  .refine(
    ({ inputTokens, cachedInputTokens }) =>
      inputTokens === null ||
      cachedInputTokens === null ||
      cachedInputTokens <= inputTokens,
    "Cached tokens are a subset of input",
  );

// Content has a closed vocabulary. Arbitrary provider metadata is not a payload.
export const telemetryContentPart = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), text: z.string().max(512000) }),
  z.strictObject({
    type: z.literal("function_call"),
    callId: key,
    name: dashboardToolName,
    arguments: z.string().max(8192),
  }),
  z.strictObject({
    type: z.literal("function_call_output"),
    callId: key,
    output: z.string().max(32000),
  }),
  z.strictObject({
    type: z.literal("omitted"),
    reason: z.enum(["size_limit", "unsupported", "redacted"]),
  }),
]);
export const telemetryMessage = z.strictObject({
  role: z.enum(["system", "developer", "user", "assistant", "tool"]),
  parts: z.array(telemetryContentPart).max(256),
});
export const telemetryFunction = z.strictObject({
  name: dashboardToolName,
  description: z.string().max(8192),
  // JSON schema is retained as validated, sanitized text, never arbitrary metadata.
  parametersJson: z.string().max(32000),
});
export const telemetryProjection = z.strictObject({
  messages: z.array(telemetryMessage).max(512),
  functions: z.array(telemetryFunction).max(16),
});
export const telemetryPayload = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: z.uuid(),
    kind: z.enum(["model_input", "model_output", "tool_input", "tool_output"]),
    capturedAt: timestamp,
    originalBytes: count,
    retainedBytes: count,
    redacted: z.boolean(),
    truncated: z.boolean(),
    captureStatus: z.enum(["captured", "partial", "missing", "omitted"]),
    reason: key.nullable(),
    content: telemetryProjection,
  })
  .refine(
    ({ retainedBytes, originalBytes }) => retainedBytes <= originalBytes,
    "Retained bytes exceed original",
  );
export const telemetryEvent = z.strictObject({
  eventKey: key,
  kind: z.enum([
    "turn_started",
    "turn_completed",
    "turn_failed",
    "turn_cancelled",
    "step_started",
    "step_completed",
    "attempt_prepared",
    "attempt_dispatched",
    "attempt_completed",
    "attempt_incomplete",
    "attempt_failed",
    "attempt_cancelled",
    "tool_requested",
    "tool_result",
    "tool_rejected",
    "tool_cancelled",
  ]),
  occurredAt: timestamp,
  turnId: key.nullable(),
  stepIndex: count.nullable(),
  sequence: count,
  purpose: z.enum(["step", "compaction"]).nullable(),
  attemptId: z.uuid().nullable(),
  callId: key.nullable(),
  tool: dashboardToolName.nullable(),
  providerResponseId: key.nullable(),
  status: z.enum([
    "prepared",
    "running",
    "succeeded",
    "incomplete",
    "failed",
    "cancelled",
    "rejected",
    "unknown",
  ]),
  durationMs: z.number().finite().nonnegative().nullable(),
  isError: z.boolean().nullable(),
  errorCode: key.nullable(),
  usage: telemetryUsage.nullable(),
  payloadIds: z.array(z.uuid()).max(4),
  captureStatus: z.enum(["captured", "partial", "missing", "omitted"]),
  sentCallIds: z.array(key).max(128),
});
export const telemetryBatch = z.strictObject({
  schemaVersion: z.literal(1),
  batchId: z.uuid(),
  principalId: z.uuid(),
  sessionId: conversationSessionId,
  events: z.array(telemetryEvent).min(1).max(dashboardLimits.batchEvents),
  payloads: z.array(telemetryPayload).max(dashboardLimits.batchEvents * 4),
});
export type TelemetryUsage = z.infer<typeof telemetryUsage>;
export type TelemetryPayload = z.infer<typeof telemetryPayload>;
export type TelemetryEvent = z.infer<typeof telemetryEvent>;
export type TelemetryBatch = z.infer<typeof telemetryBatch>;
