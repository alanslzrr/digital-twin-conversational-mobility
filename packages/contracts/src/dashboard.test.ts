import { describe, expect, it } from "vitest";
import {
  dashboardActivityInput,
  dashboardEntityQuery,
  dashboardEventQuery,
  dashboardExecutionInput,
  dashboardMapQuery,
  dashboardToolName,
} from "./dashboard";
import {
  telemetryBatch,
  telemetryEvent,
  telemetryPayload,
  telemetryUsage,
} from "./telemetry";

const id = "00000000-0000-4000-8000-000000000001";
const time = "2026-10-02T12:00:00.000Z";
const event = {
  eventKey: "event-1",
  kind: "attempt_completed",
  occurredAt: time,
  turnId: null,
  stepIndex: null,
  sequence: 1,
  purpose: "step",
  attemptId: id,
  callId: null,
  tool: null,
  providerResponseId: null,
  status: "succeeded",
  durationMs: 0,
  isError: null,
  errorCode: null,
  usage: null,
  payloadIds: [],
  captureStatus: "missing",
  sentCallIds: [],
};
describe("closed dashboard contracts", () => {
  it("contains exactly the existing sixteen tool names", () => {
    expect(dashboardToolName.options).toHaveLength(16);
    expect(new Set(dashboardToolName.options).size).toBe(16);
    expect(dashboardToolName.safeParse("force_ingest").success).toBe(false);
  });
  it("bounds filters/pages and requires effects confirmation", () => {
    expect(dashboardEntityQuery.parse({ category: "bikes" }).limit).toBe(50);
    expect(
      dashboardEntityQuery.safeParse({ category: "bikes", limit: 101 }).success,
    ).toBe(false);
    expect(
      dashboardEntityQuery.safeParse({
        category: "bikes",
        search: "a".repeat(101),
      }).success,
    ).toBe(false);
    expect(
      dashboardEntityQuery.safeParse({ category: "bikes", principalId: id })
        .success,
    ).toBe(false);
    expect(
      dashboardExecutionInput.safeParse({
        tool: "get_network_status",
        input: {},
        requestId: id,
      }).success,
    ).toBe(false);
    expect(
      dashboardExecutionInput.parse({
        tool: "get_network_status",
        input: {},
        requestId: id,
        confirmEffects: true,
      }).requestId,
    ).toBe(id);
    expect(dashboardActivityInput.safeParse({ enabled: true }).success).toBe(
      false,
    );
  });
  it("rejects reversed/invalid bbox and ranges longer than seven days", () => {
    expect(
      dashboardMapQuery.safeParse({
        category: "places",
        bbox: [-4, 40, -3, 41],
      }).success,
    ).toBe(true);
    for (const bbox of [
      [-3, 40, -4, 41],
      [-4, 41, -3, 40],
      [-181, 40, -3, 41],
      [-3, 40, -3, 41],
    ]) {
      expect(
        dashboardMapQuery.safeParse({ category: "places", bbox }).success,
      ).toBe(false);
    }
    expect(
      dashboardEventQuery.safeParse({
        from: time,
        to: "2026-10-10T12:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      dashboardEventQuery.safeParse({
        from: time,
        to: "2026-10-01T12:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
describe("closed telemetry contracts", () => {
  it("distinguishes absent usage from reported zero and validates cached subset", () => {
    const missing = {
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
      reasoningTokens: null,
    };
    expect(telemetryUsage.parse(missing)).toEqual(missing);
    expect(
      telemetryUsage.parse({ ...missing, inputTokens: 0 }).inputTokens,
    ).toBe(0);
    expect(
      telemetryUsage.safeParse({
        ...missing,
        inputTokens: 3,
        cachedInputTokens: 4,
      }).success,
    ).toBe(false);
    expect(
      telemetryUsage.safeParse({ ...missing, outputTokens: -1 }).success,
    ).toBe(false);
  });
  it("rejects credentials, reasoning content and arbitrary metadata", () => {
    expect(telemetryEvent.parse(event).usage).toBeNull();
    expect(
      telemetryEvent.safeParse({
        ...event,
        headers: { authorization: "canary" },
      }).success,
    ).toBe(false);
    const payload = {
      schemaVersion: 1,
      id,
      kind: "model_output",
      capturedAt: time,
      originalBytes: 100,
      retainedBytes: 10,
      redacted: false,
      truncated: false,
      captureStatus: "captured",
      reason: null,
      content: {
        messages: [
          { role: "assistant", parts: [{ type: "text", text: "public" }] },
        ],
        functions: [],
      },
    };
    expect(telemetryPayload.safeParse(payload).success).toBe(true);
    expect(
      telemetryPayload.safeParse({
        ...payload,
        content: { ...payload.content, encrypted_content: "canary" },
      }).success,
    ).toBe(false);
    expect(
      telemetryPayload.safeParse({
        ...payload,
        content: {
          messages: [
            {
              role: "assistant",
              parts: [{ type: "reasoning", text: "canary" }],
            },
          ],
          functions: [],
        },
      }).success,
    ).toBe(false);
    expect(
      telemetryPayload.safeParse({ ...payload, retainedBytes: 101 }).success,
    ).toBe(false);
  });
  it("requires registered session identifiers and bounds batches", () => {
    const batch = {
      schemaVersion: 1,
      batchId: id,
      principalId: id,
      sessionId: "own_session",
      events: [event],
      payloads: [],
    };
    expect(telemetryBatch.safeParse(batch).success).toBe(true);
    expect(
      telemetryBatch.safeParse({ ...batch, events: Array(33).fill(event) })
        .success,
    ).toBe(false);
    expect(
      telemetryBatch.safeParse({ ...batch, sessionId: "../../foreign" })
        .success,
    ).toBe(false);
    expect(
      telemetryBatch.safeParse({ ...batch, cookie: "canary" }).success,
    ).toBe(false);
  });
});
