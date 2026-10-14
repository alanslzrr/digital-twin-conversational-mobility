import {
  type OtelEnrichment,
  type TelemetryEvent,
  traceEnrichmentEnabled,
} from "@mobility/contracts";

type Target = OtelEnrichment["target"];
// EVE compiles hooks and instrumentation as separate entries. Keep only bounded,
// metadata-only coordination in the process so those copies rendezvous correctly.
const registryKey = Symbol.for("mobai.otel-coordination.v1");
type Registry = {
  acknowledged: Map<string, number>;
  listeners: Set<() => void>;
  principals: Map<string, { principalId: string; at: number }>;
};
const host = globalThis as typeof globalThis & { [registryKey]?: Registry };
host[registryKey] ??= {
  acknowledged: new Map(),
  listeners: new Set(),
  principals: new Map(),
};
const { acknowledged, listeners, principals } = host[registryKey];
const key = (session: string, target: Target) =>
  JSON.stringify([session, target]);
function sweep() {
  const cutoff = Date.now() - 30 * 60_000;
  for (const [id, at] of acknowledged) if (at < cutoff) acknowledged.delete(id);
  while (acknowledged.size > 1000)
    acknowledged.delete(acknowledged.keys().next().value ?? "");
  for (const [id, entry] of principals)
    if (entry.at < cutoff) principals.delete(id);
  while (principals.size > 100)
    principals.delete(principals.keys().next().value ?? "");
}
export function registerTracePrincipal(principalId: string, sessionId: string) {
  if (!traceEnrichmentEnabled(process.env)) return;
  principals.set(sessionId, { principalId, at: Date.now() });
  sweep();
}
export function telemetryPrincipal(sessionId: string) {
  sweep();
  return principals.get(sessionId)?.principalId;
}
export function terminalReady(session: string, target: Target) {
  sweep();
  return acknowledged.has(key(session, target));
}
export function onTerminalReady(listener: () => void) {
  listeners.add(listener);
  if (listeners.size > 8) {
    const oldest = listeners.values().next().value;
    if (oldest) listeners.delete(oldest);
  }
  return () => {
    listeners.delete(listener);
  };
}
export function acknowledgeTerminals(
  session: string,
  events: TelemetryEvent[],
  keys: unknown,
) {
  if (!traceEnrichmentEnabled(process.env) || !Array.isArray(keys)) return;
  const ids = new Set(keys.filter((v) => typeof v === "string"));
  for (const e of events) {
    if (!ids.has(e.eventKey)) continue;
    let target: Target | undefined;
    if (
      ["turn_completed", "turn_failed", "turn_cancelled"].includes(e.kind) &&
      e.turnId
    )
      target = { kind: "turn", turnId: e.turnId };
    else if (e.kind === "step_completed" && e.turnId && e.stepIndex !== null)
      target = { kind: "step", turnId: e.turnId, stepIndex: e.stepIndex };
    else if (
      [
        "attempt_completed",
        "attempt_incomplete",
        "attempt_failed",
        "attempt_cancelled",
      ].includes(e.kind) &&
      e.attemptId &&
      e.turnId &&
      e.stepIndex !== null &&
      e.purpose
    )
      target = {
        kind: "model",
        turnId: e.turnId,
        stepIndex: e.stepIndex,
        purpose: e.purpose,
      };
    else if (["tool_result", "tool_cancelled"].includes(e.kind) && e.callId)
      target = { kind: "tool", callId: e.callId };
    if (target) acknowledged.set(key(session, target), Date.now());
  }
  sweep();
  for (const listener of listeners) {
    try {
      listener();
    } catch {}
  }
}
