import { randomUUID } from "node:crypto";
import {
  type TelemetryEvent,
  type TelemetryPayload,
  telemetryEvent,
} from "@mobility/contracts";
import type { BudgetContext } from "./budgeted-fetch";
import { record } from "./telemetry-projection";

const early = new Map<
  string,
  { events: TelemetryEvent[]; at: number; omitted: number }
>();
const toolStarts = new Map<string, { at: number; seen: number }>();
const registered = new Map<string, { principalId: string; at: number }>();
function sweep() {
  const cutoff = Date.now() - 1800000;
  for (const [key, v] of toolStarts)
    if (v.seen < cutoff) toolStarts.delete(key);
  while (toolStarts.size > 1000)
    toolStarts.delete(toolStarts.keys().next().value ?? "");
  for (const [key, v] of registered) if (v.at < cutoff) registered.delete(key);
  for (const [key, v] of early) if (v.at < cutoff) early.delete(key);
  if (registered.size > 100)
    registered.delete(registered.keys().next().value ?? "");
  if (early.size > 100) early.delete(early.keys().next().value ?? "");
}
export function event(
  fields: Partial<TelemetryEvent> &
    Pick<TelemetryEvent, "eventKey" | "kind" | "status">,
): TelemetryEvent {
  return telemetryEvent.parse({
    occurredAt: new Date().toISOString(),
    turnId: null,
    stepIndex: null,
    sequence: 0,
    purpose: null,
    attemptId: null,
    callId: null,
    tool: null,
    providerResponseId: null,
    durationMs: null,
    isError: null,
    errorCode: null,
    usage: null,
    payloadIds: [],
    captureStatus: "missing",
    sentCallIds: [],
    ...fields,
  });
}
export async function sendTelemetry(
  principalId: string,
  sessionId: string,
  events: TelemetryEvent[],
  payloads: TelemetryPayload[] = [],
) {
  try {
    const base = process.env.MOBILITY_MCP_URL,
      token = process.env.MOBILITY_MCP_TOKEN;
    if (!base || !token) return;
    const url = new URL("/internal/telemetry", base);
    if (
      url.protocol !== "https:" &&
      !["127.0.0.1", "localhost"].includes(url.hostname)
    )
      return;
    const batch = {
      schemaVersion: 1,
      batchId: randomUUID(),
      principalId,
      sessionId,
      events: events.slice(0, 32),
      payloads,
    };
    let body = JSON.stringify(batch);
    if (Buffer.byteLength(body) > 1048576) {
      batch.payloads = [];
      batch.events = batch.events.map((e) => ({
        ...e,
        payloadIds: [],
        captureStatus: "missing" as const,
      }));
      body = JSON.stringify(batch);
      if (Buffer.byteLength(body) > 1048576) return;
    }
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(200),
    });
    await response.body?.cancel();
  } catch {
    /* Capturing is best-effort and cannot change inference behavior. */
  }
}
export async function bindTelemetry(principalId: string, sessionId: string) {
  sweep();
  registered.set(sessionId, { principalId, at: Date.now() });
  const queued = early.get(sessionId);
  early.delete(sessionId);
  if (queued?.events.length)
    await sendTelemetry(
      principalId,
      sessionId,
      queued.events.map((e) =>
        queued.omitted ? { ...e, captureStatus: "missing" as const } : e,
      ),
    );
}
export async function captureLifecycle(value: unknown, sessionId: string) {
  try {
    sweep();
    const envelope = record(value),
      data = record(envelope.data),
      meta = record(envelope.meta);
    const type = String(envelope.type);
    const kinds: Record<string, TelemetryEvent["kind"]> = {
      "turn.started": "turn_started",
      "turn.completed": "turn_completed",
      "turn.failed": "turn_failed",
      "turn.cancelled": "turn_cancelled",
      "step.started": "step_started",
      "step.completed": "step_completed",
    };
    if (!kinds[type]) return;
    const e = event({
      eventKey:
        typeof meta.id === "string" ? `${meta.id}:${type}` : randomUUID(),
      kind: kinds[type],
      status: type.endsWith("completed")
        ? "succeeded"
        : type.endsWith("failed")
          ? "failed"
          : type.endsWith("cancelled")
            ? "cancelled"
            : "running",
      turnId: typeof data.turnId === "string" ? data.turnId : null,
      stepIndex: typeof data.stepIndex === "number" ? data.stepIndex : null,
      sequence: typeof data.sequence === "number" ? data.sequence : 0,
      occurredAt:
        typeof meta.at === "string" ? meta.at : new Date().toISOString(),
    });
    const scope = registered.get(sessionId);
    if (scope) {
      scope.at = Date.now();
      await sendTelemetry(scope.principalId, sessionId, [e]);
    } else {
      const queue = early.get(sessionId) ?? {
        events: [],
        at: Date.now(),
        omitted: 0,
      };
      if (
        queue.events.length < 32 &&
        Buffer.byteLength(JSON.stringify([...queue.events, e])) <= 32768
      )
        queue.events.push(e);
      else queue.omitted++;
      early.set(sessionId, queue);
    }
  } catch {
    /* Never interfere with trusted registration or chat events. */
  }
}
export async function captureTool(
  scope: BudgetContext,
  value: unknown,
  kind: "tool_requested" | "tool_result",
  callId: string,
  name: unknown,
  isError = false,
) {
  const { dashboardToolName } = await import("@mobility/contracts");
  const { projectPayload } = await import("./telemetry-projection");
  try {
    sweep();
    const key = scope.sessionId + ":" + callId;
    const start = toolStarts.get(key);
    if (kind === "tool_requested")
      toolStarts.set(key, { at: performance.now(), seen: Date.now() });
    else toolStarts.delete(key);
    const tool = dashboardToolName.parse(name);
    const payload = projectPayload(
      value,
      kind === "tool_requested" ? "tool_input" : "tool_output",
    );
    await sendTelemetry(
      scope.principalId,
      scope.sessionId,
      [
        event({
          eventKey: `${callId}:${kind}`,
          kind,
          status:
            kind === "tool_requested"
              ? "running"
              : isError
                ? "failed"
                : "succeeded",
          turnId: scope.turnId,
          stepIndex: scope.stepIndex,
          callId,
          tool,
          isError,
          durationMs:
            kind === "tool_result" && start
              ? performance.now() - start.at
              : null,
          payloadIds: [payload.id],
          captureStatus: payload.captureStatus,
        }),
      ],
      [payload],
    );
  } catch {
    /* No fabricated correlation if the IDs/schema don't match. */
  }
}

export async function captureToolTerminal(
  scope: BudgetContext,
  kind: "tool_rejected" | "tool_cancelled",
  callId: string,
  name: unknown,
) {
  try {
    const { dashboardToolName } = await import("@mobility/contracts");
    toolStarts.delete(scope.sessionId + ":" + callId);
    await sendTelemetry(scope.principalId, scope.sessionId, [
      event({
        eventKey: `${callId}:${kind}`,
        kind,
        status: kind === "tool_cancelled" ? "cancelled" : "failed",
        callId,
        tool: dashboardToolName.parse(name),
        turnId: scope.turnId,
        errorCode:
          kind === "tool_rejected" ? "tool_budget_rejected" : "tool_cancelled",
      }),
    ]);
  } catch {
    /* Metadata is optional. */
  }
}
