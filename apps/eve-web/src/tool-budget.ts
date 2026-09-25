import { createHash } from "node:crypto";
export type ToolBudget = {
  turnId: string;
  calls: Record<string, { name: string; input: string; done: boolean }>;
  failedSearches: number;
  repeats: Record<string, { output: string; count: number; at: number }>;
};
export const emptyToolBudget = (turnId: string): ToolBudget => ({
  turnId,
  calls: {},
  failedSearches: 0,
  repeats: {},
});
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function admitTools(
  state: ToolBudget,
  actions: readonly {
    callId: string;
    kind: string;
    toolName?: string;
    input?: unknown;
  }[],
  now = Date.now(),
): ToolBudget {
  if (actions.length > 4) throw new Error("Tool batch limit reached");
  const next = structuredClone(state);
  for (const action of actions) {
    if (action.kind !== "tool-call" || !action.toolName)
      throw new Error("Unsupported budgeted action");
    const input = digest(canonical(action.input));
    const previous = next.calls[action.callId];
    if (previous) {
      if (previous.input !== input || previous.name !== action.toolName)
        throw new Error("Conflicting tool replay");
      continue;
    }
    if (
      Object.keys(next.calls).length >= 16 ||
      Buffer.byteLength(JSON.stringify(action.input)) > 8192
    )
      throw new Error("Tool turn limit reached");
    const searches = Object.values(next.calls).filter(
      (call) => call.name === "connection_search" && !call.done,
    ).length;
    if (
      action.toolName === "connection_search" &&
      next.failedSearches + searches >= 2
    )
      throw new Error("Two unsuccessful searches; capability unavailable");
    const repeat = next.repeats[`${action.toolName}:${input}`];
    if (repeat && repeat.count >= 2 && now - repeat.at < 30_000)
      throw new Error("Repeated identical tool result without progress");
    next.calls[action.callId] = { name: action.toolName, input, done: false };
  }
  return next;
}
export function finishTool(
  state: ToolBudget,
  callId: string,
  output: unknown,
  failed: boolean,
  now = Date.now(),
) {
  const bytes = Buffer.byteLength(JSON.stringify(output));
  if (bytes > 32_000)
    throw new Error("Tool result exceeds bounded context; refine the query");
  const next = structuredClone(state);
  const call = next.calls[callId];
  if (!call) throw new Error("Unattributed tool result");
  if (call.done) return next;
  call.done = true;
  if (
    call.name === "connection_search" &&
    (failed ||
      !Array.isArray(output) ||
      !output.some(
        (item) =>
          item &&
          typeof item === "object" &&
          typeof item.qualifiedName === "string",
      ))
  )
    next.failedSearches++;
  const key = `${call.name}:${call.input}`;
  const fingerprint = digest(canonical(output));
  const previous = next.repeats[key];
  next.repeats[key] = {
    output: fingerprint,
    count: previous?.output === fingerprint ? previous.count + 1 : 1,
    at: now,
  };
  return next;
}
