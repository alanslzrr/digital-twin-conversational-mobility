import type { dashboardTracePage } from "@mobility/contracts";
import type { z } from "zod";

export type TraceEvent = z.infer<typeof dashboardTracePage>["events"][number];
export type TraceKind = "turn" | "step" | "model" | "tool";
export type TraceOperation = {
  id: string;
  kind: TraceKind;
  events: TraceEvent[];
  event: TraceEvent;
  span: TraceEvent["otel"];
  start: number;
  end: number;
  terminal: boolean;
  parent: string | null;
  relation: "native" | "logical" | "root";
  children: TraceOperation[];
};
export const TRACE_EVENT_LIMIT = 1000;
const rank: Record<TraceKind, number> = { turn: 0, step: 1, model: 2, tool: 2 };
const terminal = (e: TraceEvent) =>
  ![
    "turn_started",
    "step_started",
    "attempt_prepared",
    "attempt_dispatched",
    "tool_requested",
  ].includes(e.kind);
const kindOf = (e: TraceEvent): TraceKind =>
  e.kind.startsWith("attempt_") ? "model" : (e.kind.split("_")[0] as TraceKind);
const turnKey = (id: string) => `turn:${id}`;
const stepKey = (id: string, index: number) => `step:${id}:${index}`;
function operationKey(e: TraceEvent) {
  const kind = kindOf(e);
  if (kind === "turn" && e.turnId) return turnKey(e.turnId);
  if (kind === "step" && e.turnId && e.stepIndex !== null)
    return stepKey(e.turnId, e.stepIndex);
  if (kind === "model" && e.attemptId) return `model:${e.attemptId}`;
  if (kind === "tool" && e.callId) return `tool:${e.callId}`;
  // Missing identities are not guessed from adjacent timestamps or step numbers.
  return `event:${e.id}`;
}
export function mergeTraceEvents(
  ...pages: readonly TraceEvent[][]
): TraceEvent[] {
  const byId = new Map<string, TraceEvent>();
  for (const page of pages) for (const event of page) byId.set(event.id, event);
  return [...byId.values()].sort(
    (a, b) =>
      Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
      a.id.length - b.id.length ||
      a.id.localeCompare(b.id),
  );
}
export function projectTrace(events: TraceEvent[]) {
  const groups = new Map<string, TraceEvent[]>();
  for (const e of mergeTraceEvents(events)) {
    const id = operationKey(e);
    const group = groups.get(id) ?? [];
    group.push(e);
    groups.set(id, group);
  }
  const operations: TraceOperation[] = [...groups].map(([id, group]) => {
    const last = [...group].reverse().find(terminal) ?? group[group.length - 1];
    if (!last) throw new Error("Empty trace operation");
    const span = last.otel;
    const start = Date.parse(span?.startedAt ?? last.occurredAt);
    return {
      id,
      kind: kindOf(last),
      events: group,
      event: last,
      span,
      start,
      end: span ? Date.parse(span.endedAt) : start,
      terminal: terminal(last),
      parent: null,
      relation: "root",
      children: [],
    };
  });
  const byId = new Map(operations.map((o) => [o.id, o]));
  const bySpan = new Map<string, TraceOperation | null>();
  for (const o of operations)
    if (o.span) {
      const key = `${o.span.traceId}:${o.span.spanId}`;
      bySpan.set(key, bySpan.has(key) ? null : o);
    }
  for (const o of operations) {
    const native = o.span?.parentSpanId
      ? bySpan.get(`${o.span.traceId}:${o.span.parentSpanId}`)
      : null;
    const e = o.event;
    const logical = e.turnId
      ? ((o.kind !== "step" && e.stepIndex !== null
          ? byId.get(stepKey(e.turnId, e.stepIndex))
          : null) ?? byId.get(turnKey(e.turnId)))
      : null;
    // Rank prevents cycles and disallows attaching an operation to a peer.
    const parent =
      native && rank[native.kind] < rank[o.kind]
        ? native
        : logical && rank[logical.kind] < rank[o.kind]
          ? logical
          : null;
    if (parent) {
      o.parent = parent.id;
      o.relation = parent === native ? "native" : "logical";
      parent.children.push(o);
    }
  }
  const order = (a: TraceOperation, b: TraceOperation) =>
    a.start - b.start || a.id.localeCompare(b.id);
  for (const o of operations) o.children.sort(order);
  const roots = operations.filter((o) => !o.parent).sort(order);
  const start = operations.length
    ? Math.min(...operations.map((o) => o.start))
    : 0;
  const end = operations.length
    ? Math.max(...operations.map((o) => o.end))
    : start;
  return { operations, roots, start, end };
}

export function visibleTraceRows(
  roots: TraceOperation[],
  collapsed: ReadonlySet<string>,
  query: string,
  label: (o: TraceOperation) => string,
) {
  const needle = query.trim().toLocaleLowerCase();
  const matches = new Set<string>();
  function scan(o: TraceOperation): boolean {
    const own =
      `${label(o)} ${o.event.status} ${o.event.turnId ?? ""} ${o.event.attemptId ?? ""} ${o.event.callId ?? ""} ${o.span?.traceId ?? ""} ${o.span?.spanId ?? ""}`
        .toLocaleLowerCase()
        .includes(needle);
    const descendants = o.children.map(scan).some(Boolean);
    if (own || descendants) matches.add(o.id);
    return own || descendants;
  }
  if (needle) for (const root of roots) scan(root);
  const rows: { operation: TraceOperation; depth: number }[] = [];
  function visit(o: TraceOperation, depth: number) {
    if (needle && !matches.has(o.id)) return;
    rows.push({ operation: o, depth });
    if (needle || !collapsed.has(o.id))
      for (const child of o.children) visit(child, depth + 1);
  }
  for (const root of roots) visit(root, 0);
  return rows;
}

export function traceBar(
  o: Pick<TraceOperation, "start" | "end">,
  start: number,
  end: number,
) {
  if (o.end < start || o.start > end) return null;
  const range = Math.max(1, end - start);
  return {
    left: Math.max(0, ((o.start - start) / range) * 100),
    width: Math.max(
      0,
      ((Math.min(end, o.end) - Math.max(start, o.start)) / range) * 100,
    ),
  };
}
