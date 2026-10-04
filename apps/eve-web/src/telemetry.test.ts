import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bindTelemetry,
  captureLifecycle,
  captureTool,
  captureToolTerminal,
} from "./telemetry";

const scope = {
  principalId: "qa-owner",
  sessionId: "qa-session",
  turnId: "qa-turn",
  stepIndex: 0,
  purpose: "step" as const,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function sink() {
  vi.stubEnv("MOBILITY_MCP_URL", "http://127.0.0.1:3003/mcp");
  vi.stubEnv("MOBILITY_MCP_TOKEN", "synthetic-test-only");
  const batches: { events: Record<string, unknown>[] }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      batches.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }),
  );
  return batches;
}
describe("EVE runtime telemetry capture", () => {
  it("retains qualified requested/result/rejected/cancelled calls and closed discovery", async () => {
    const batches = sink();
    await captureTool(
      scope,
      {},
      "tool_requested",
      "call-qa",
      "mobility__get_network_status",
    );
    await captureTool(
      scope,
      { status: "found" },
      "tool_result",
      "call-qa",
      "mobility__get_network_status",
      true,
    );
    await captureToolTerminal(
      scope,
      "tool_rejected",
      "call-rejected",
      "mobility__get_network_status",
    );
    await captureToolTerminal(
      scope,
      "tool_cancelled",
      "call-cancelled",
      "mobility__get_network_status",
    );
    await captureTool(
      scope,
      {},
      "tool_requested",
      "discovery",
      "connection_search",
    );
    await captureTool(
      scope,
      {},
      "tool_requested",
      "invalid",
      "arbitrary__get_network_status",
    );
    expect(
      batches
        .flatMap((b) => b.events)
        .map((e) => [e.kind, e.status, e.callId, e.tool]),
    ).toEqual([
      ["tool_requested", "running", "call-qa", "mobility__get_network_status"],
      ["tool_result", "failed", "call-qa", "mobility__get_network_status"],
      [
        "tool_rejected",
        "rejected",
        "call-rejected",
        "mobility__get_network_status",
      ],
      [
        "tool_cancelled",
        "cancelled",
        "call-cancelled",
        "mobility__get_network_status",
      ],
      ["tool_requested", "running", "discovery", "connection_search"],
    ]);
  });
  it("measures a turn from real lifecycle hooks, not attempt sums or provider timestamps", async () => {
    const batches = sink();
    await bindTelemetry("qa-owner", "qa-lifecycle");
    const clock = vi.spyOn(performance, "now");
    clock.mockReturnValueOnce(100).mockReturnValueOnce(950);
    await captureLifecycle(
      { type: "turn.started", meta: { id: "start" }, data: { turnId: "turn" } },
      "qa-lifecycle",
    );
    await captureLifecycle(
      {
        type: "turn.started",
        meta: { id: "duplicate-start" },
        data: { turnId: "turn" },
      },
      "qa-lifecycle",
    );
    await captureLifecycle(
      { type: "turn.completed", meta: { id: "end" }, data: { turnId: "turn" } },
      "qa-lifecycle",
    );
    await captureLifecycle(
      {
        type: "turn.failed",
        meta: { id: "unknown-start" },
        data: { turnId: "other" },
      },
      "qa-lifecycle",
    );
    expect(batches.flatMap((b) => b.events).map((e) => e.durationMs)).toEqual([
      null,
      null,
      850,
      null,
    ]);
  });
});
