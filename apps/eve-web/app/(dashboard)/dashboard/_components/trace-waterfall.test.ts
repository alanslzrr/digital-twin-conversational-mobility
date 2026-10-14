// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import type { TraceEvent } from "@/src/trace-waterfall";
import { TraceWaterfall, WaterfallChart } from "./trace-waterfall";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  request: vi.fn(),
  mutate: vi.fn(),
  paused: false,
  visible: true,
}));
vi.mock("@/src/dashboard-client", () => ({
  useDashboard: mocks.read,
  useDashboardContext: () => ({
    request: mocks.request,
    paused: mocks.paused,
    visible: mocks.visible,
  }),
}));
vi.mock("@/i18n/provider", () => ({
  useUi: () => ({
    numberLocale: "en-US",
    t: (key: string, values: Record<string, unknown> = {}) => {
      const [group = "", name = ""] = key.split(".");
      const text =
        (en as unknown as Record<string, Record<string, string>>)[group]?.[
          name
        ] ?? key;
      return text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k]));
    },
  }),
}));
vi.mock("./shared", () => ({
  Instant: ({ value }: { value: string }) =>
    React.createElement("time", {}, value),
  State: ({ error }: { error: unknown }) =>
    error ? React.createElement("p", { role: "alert" }, "Read failed") : null,
  Technical: () =>
    React.createElement(
      "details",
      {},
      React.createElement("summary", {}, "Technical"),
    ),
}));
vi.mock("./trace-payload", () => ({
  TracePayload: ({ value }: { value: unknown }) =>
    React.createElement("pre", {}, JSON.stringify(value)),
}));
function event(overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    id: "1",
    eventKey: "e1",
    kind: "turn_completed",
    occurredAt: "2026-10-14T10:00:01Z",
    turnId: "t1",
    stepIndex: null,
    purpose: null,
    attemptId: null,
    callId: null,
    tool: null,
    toolIdentity: null,
    providerResponseId: null,
    durationMs: 1000,
    isError: false,
    status: "succeeded",
    captureStatus: "captured",
    payloadIds: [],
    sentCallIds: [],
    inputTokens: null,
    outputTokens: null,
    cachedInputTokens: null,
    reasoningTokens: null,
    otel: {
      source: "eve@0.65.0",
      kind: "turn",
      traceId: "a".repeat(32),
      spanId: "1".repeat(16),
      parentSpanId: null,
      startedAt: "2026-10-14T10:00:00Z",
      endedAt: "2026-10-14T10:00:01Z",
      durationMs: 1000,
    },
    ...overrides,
  };
}
const turn = event();
if (!turn.otel) throw new Error("Missing fixture span");
const model = event({
  id: "2",
  kind: "attempt_completed",
  attemptId: "a1",
  stepIndex: 0,
  inputTokens: 100,
  outputTokens: 10,
  cachedInputTokens: 50,
  reasoningTokens: 2,
  payloadIds: ["payload-id"],
  otel: {
    ...turn.otel,
    kind: "model",
    spanId: "2".repeat(16),
    parentSpanId: "1".repeat(16),
  },
});
let root: Root, host: HTMLDivElement;
const render = async (element: React.ReactNode) => {
  await act(() => root.render(element));
};
const button = (name: string) => {
  const found = [...host.querySelectorAll("button")].find(
    (e) => e.textContent === name || e.getAttribute("aria-label") === name,
  );
  if (!found) throw new Error(`Missing button ${name}`);
  return found;
};
const click = async (name: string) => {
  await act(() => button(name).click());
};
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.read.mockReset();
  mocks.request.mockReset();
  mocks.mutate.mockReset();
  mocks.paused = false;
  mocks.visible = true;
  mocks.read.mockReturnValue({
    data: { data: { events: [turn, model], nextCursor: null } },
    isLoading: false,
    isValidating: false,
    mutate: mocks.mutate,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const chart = () =>
  React.createElement(WaterfallChart, {
    events: [turn, model],
    sessionId: "session",
  });
const loader = () =>
  React.createElement(TraceWaterfall, {
    sessionId: "session",
    turn: "",
    summary: { state: "succeeded", lastObservedAt: "2026-10-14T10:00:01Z" },
  });

describe("waterfall controls without new producers or inference", () => {
  it("renders bars and operates collapse/expand with no requests", async () => {
    await render(chart());
    expect(host.querySelectorAll(".dc-trace-bar")).toHaveLength(2);
    await click("Collapse all");
    expect(host.querySelectorAll(".dc-trace-row")).toHaveLength(1);
    await click("Expand all");
    expect(host.querySelectorAll(".dc-trace-row")).toHaveLength(2);
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("keeps whitespace searches consistent with the visible collapsed tree", async () => {
    await render(chart());
    await click("Collapse all");
    const input = host.querySelector("input");
    if (!input) throw new Error("Missing search");
    await act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "   ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const toggle = host.querySelector<HTMLButtonElement>(".dc-trace-toggle");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.disabled).toBe(false);
    await act(() => toggle?.click());
    expect(host.querySelectorAll(".dc-trace-row")).toHaveLength(2);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("selects a model and uses original usage fields with subset labels", async () => {
    await render(chart());
    await click("Inspect Model call: 1 s");
    expect(host.querySelector(".dc-trace-inspector")?.textContent).toContain(
      "Reported usage for this attempt",
    );
    expect(host.querySelector(".dc-trace-inspector")?.textContent).toContain(
      "Cache (included)50",
    );
    expect(
      host.querySelector(".dc-trace-inspector")?.textContent,
    ).not.toContain("160");
    await click("Focus this interval");
    expect(button("Show full interval")).toBeTruthy();
    await click("Show full interval");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("fetches content only on demand through the existing owned reader", async () => {
    mocks.request.mockResolvedValue({ data: { content: "sanitized" } });
    await render(chart());
    await click("Inspect Model call: 1 s");
    expect(mocks.request).not.toHaveBeenCalled();
    await click("View sanitized content 1");
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith(
      "conversations/session/payloads/payload-id",
    );
    expect(host.textContent).toContain("sanitized");
  });
  it("ignores late payloads after a different operation is selected", async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.request.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await render(chart());
    await click("Inspect Model call: 1 s");
    await click("View sanitized content 1");
    await click("Inspect Turn 1: 1 s");
    await act(() => finish({ data: { content: "wrong operation content" } }));
    expect(host.textContent).not.toContain("wrong operation content");
  });
  it("marks absent spans and unknown tokens without fabricating live bars", async () => {
    await render(
      React.createElement(WaterfallChart, {
        events: [
          event({
            ...model,
            otel: null,
            status: "failed",
            kind: "attempt_failed",
            inputTokens: null,
            outputTokens: null,
          }),
        ],
        sessionId: "s",
      }),
    );
    expect(host.querySelectorAll(".dc-trace-bar")).toHaveLength(0);
    expect(host.querySelectorAll(".dc-trace-point")).toHaveLength(1);
    expect(host.textContent).toContain("Unknown");
    expect(host.textContent).toContain("Failed");
  });
  it("paginates explicitly, merges shared identities and stops refresh", async () => {
    mocks.read.mockImplementation((path: string) => ({
      data: {
        data: path.includes("cursor=")
          ? { events: [model], nextCursor: null }
          : { events: [turn], nextCursor: "next" },
      },
      mutate: mocks.mutate,
    }));
    await render(loader());
    expect(host.textContent).toContain("Partial view");
    await click("Load next 100 events");
    expect(host.querySelectorAll(".dc-trace-row")).toHaveLength(2);
    expect(mocks.read).toHaveBeenLastCalledWith(
      "conversations/session/events?limit=100&cursor=next",
      0,
    );
    expect(host.textContent).toContain("automatic refresh stopped");
    await click("Return to start and refresh");
    expect(host.querySelectorAll(".dc-trace-row")).toHaveLength(1);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("limits explicit accumulation to 1000 and honours pause for more reads", async () => {
    mocks.read.mockReturnValue({
      data: {
        data: {
          events: Array.from({ length: 1000 }, (_, i) =>
            event({ id: String(i), turnId: `turn${i}` }),
          ),
          nextCursor: "next",
        },
      },
    });
    await render(loader());
    expect(button("Load next 100 events").disabled).toBe(true);
    mocks.read.mockReturnValue({
      data: { data: { events: [turn], nextCursor: "next" } },
    });
    mocks.paused = true;
    await render(loader());
    expect(button("Load next 100 events").disabled).toBe(true);
  });
  it("preserves the selected turn ordinal when filtering", async () => {
    await render(
      React.createElement(WaterfallChart, {
        events: [turn],
        sessionId: "s",
        filteredTurn: "t1",
        turnOrdinal: 2,
      }),
    );
    expect(host.querySelector("h3")?.textContent).toBe("Turn 2");
  });
});
