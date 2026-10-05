import { Window } from "happy-dom";
import React, { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentChat } from "@/app/_components/agent-chat";
import { AgentMessage } from "@/app/_components/agent-message";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { UiProvider, useUi } from "./provider";

const runtime = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
  requests: 0,
  status: "streaming",
  session: "synthetic-session",
}));
vi.mock("eve/react", () => ({
  useEveAgent: () => {
    useEffect(() => {
      runtime.mounts++;
      return () => {
        runtime.unmounts++;
      };
    }, []);
    return {
      status: runtime.status,
      data: { messages: [] },
      events: [],
      session: { sessionId: runtime.session },
      send: () => {
        runtime.requests++;
      },
      respond: () => {
        runtime.requests++;
      },
      cancel: () => {
        runtime.requests++;
      },
    };
  },
}));
function RuntimeProbe() {
  const { t } = useUi();
  const [draft, setDraft] = useState("Synthetic draft");
  useEffect(() => {
    runtime.mounts++;
    return () => {
      runtime.unmounts++;
    };
  }, []);
  return React.createElement(
    "section",
    { "data-session": runtime.session, "data-status": runtime.status },
    React.createElement("input", {
      value: draft,
      onChange: (e) => setDraft(e.currentTarget.value),
    }),
    React.createElement("p", null, "Original conversation / proveedor"),
    React.createElement("p", null, t("agentChat.thinking")),
  );
}
let browser: Window, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  browser = new Window({ url: "https://example.invalid" });
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "Event",
    "MouseEvent",
    "CustomEvent",
    "Node",
    "MutationObserver",
    "getComputedStyle",
    "ResizeObserver",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "sessionStorage",
    "localStorage",
  ]) {
    vi.stubGlobal(
      key,
      key === "window"
        ? browser
        : (browser as unknown as Record<string, unknown>)[key],
    );
  }
  runtime.mounts = 0;
  runtime.unmounts = 0;
  runtime.requests = 0;
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.unstubAllGlobals();
  await browser.happyDOM.close();
});
it("switches without remounting children, changing drafts, messages, focus or generation", async () => {
  await act(() =>
    root.render(
      React.createElement(
        UiProvider,
        { initialLocale: "es" },
        React.createElement(LocaleSwitcher),
        React.createElement(RuntimeProbe),
      ),
    ),
  );
  const input = document.querySelector("input")!;
  input.focus();
  const english = document.querySelector<HTMLButtonElement>(
    '[aria-label="English"]',
  )!;
  await act(() => english.click());
  expect(document.documentElement.lang).toBe("en");
  expect(document.cookie).toContain("mobility-locale=en");
  expect(document.querySelector("input")).toBe(input);
  expect(input.value).toBe("Synthetic draft");
  expect(document.activeElement).toBe(input);
  expect(document.body.textContent).toContain(
    "Original conversation / proveedor",
  );
  expect(document.querySelector("section")?.dataset.status).toBe("streaming");
  expect(runtime.mounts).toBe(1);
  expect(runtime.unmounts).toBe(0);
  expect(runtime.requests).toBe(0);
  await act(() =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Español"]')!
      .click(),
  );
  expect(runtime.mounts).toBe(1);
});
it("retains the in-memory locale when the cookie setter is blocked", async () => {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => "",
    set: () => {
      throw new Error("blocked");
    },
  });
  await act(() =>
    root.render(
      React.createElement(
        UiProvider,
        { initialLocale: "es" },
        React.createElement(LocaleSwitcher),
      ),
    ),
  );
  await act(() =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="English"]')!
      .click(),
  );
  expect(document.documentElement.lang).toBe("en");
  expect(
    document
      .querySelector('[aria-label="English"]')
      ?.getAttribute("aria-pressed"),
  ).toBe("true");
});
it.each(["es", "en"] as const)(
  "renders native session-limit controls in %s without translating payloads",
  (locale) => {
    const message = {
      id: "synthetic",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolCallId: "limit",
          toolName: "session_limit_continuation",
          state: "approval-requested",
          input: { kind: "output", limit: 12000, usedTokens: 12001 },
          toolMetadata: {
            eve: {
              inputRequest: {
                requestId: "synthetic:limit:output:12001",
                kind: "session-limit",
                prompt: "Original runtime limit prompt",
                options: [
                  { id: "continue", label: "Approve", style: "primary" },
                  { id: "stop", label: "Stop", style: "danger" },
                ],
              },
            },
          },
        },
      ],
    };
    const html = renderToStaticMarkup(
      React.createElement(
        UiProvider,
        { initialLocale: locale },
        React.createElement(AgentMessage, {
          message: message as never,
          canRespond: true,
          isStreaming: false,
          onInputResponses: () => undefined,
        }),
      ),
    );
    expect(html).toContain(locale === "es" ? "Aprobar" : "Approve");
    expect(html).toContain(locale === "es" ? "Detener" : "Stop");
    expect(html).toContain("12000");
    expect(html).not.toContain("Original runtime limit prompt");
    expect(message.parts[0]!.toolMetadata.eve.inputRequest.options[0]!.id).toBe(
      "continue",
    );
  },
);

it("keeps the actual EVE chat hook mounted during mocked streaming and resume", async () => {
  for (const status of ["streaming", "resuming", "idle"]) {
    runtime.status = status;
    await act(() =>
      root.render(
        React.createElement(
          UiProvider,
          { initialLocale: "es" },
          React.createElement(LocaleSwitcher),
          React.createElement(AgentChat, { sessionId: runtime.session }),
        ),
      ),
    );
    const before = runtime.mounts,
      textarea = document.querySelector("textarea");
    await act(() =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="English"]')!
        .click(),
    );
    expect(runtime.mounts).toBe(before);
    expect(runtime.unmounts).toBe(0);
    expect(runtime.requests).toBe(0);
    expect(document.querySelector("textarea")).toBe(textarea);
  }
});
it("preserves native paused approval identity and only responds on an explicit click", async () => {
  const response = vi.fn();
  const message = {
    id: "synthetic",
    role: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolCallId: "limit",
        toolName: "session_limit_continuation",
        state: "approval-requested",
        input: { kind: "token-cost", limitUsd: 0.1, usedCostUsd: 0.11 },
        toolMetadata: {
          eve: {
            inputRequest: {
              requestId: "synthetic:limit:token-cost:0.11",
              kind: "session-limit",
              prompt: "Original limit",
              options: [
                { id: "continue", label: "Approve", style: "primary" },
                { id: "stop", label: "Stop", style: "danger" },
              ],
            },
          },
        },
      },
    ],
  };
  await act(() =>
    root.render(
      React.createElement(
        UiProvider,
        { initialLocale: "es" },
        React.createElement(LocaleSwitcher),
        React.createElement(AgentMessage, {
          message: message as never,
          canRespond: true,
          isStreaming: false,
          onInputResponses: response,
        }),
      ),
    ),
  );
  const approve = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent === "Aprobar",
  )!;
  expect(response).not.toHaveBeenCalled();
  await act(() =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="English"]')!
      .click(),
  );
  expect(approve.isConnected).toBe(true);
  expect(approve.textContent).toBe("Approve");
  expect(response).not.toHaveBeenCalled();
  await act(() => approve.click());
  expect(response).toHaveBeenCalledExactlyOnceWith([
    { optionId: "continue", requestId: "synthetic:limit:token-cost:0.11" },
  ]);
});
it("supports arrow and Home/End keyboard selection with visible focus", async () => {
  await act(() =>
    root.render(
      React.createElement(
        UiProvider,
        { initialLocale: "es" },
        React.createElement(LocaleSwitcher),
      ),
    ),
  );
  const spanish = document.querySelector<HTMLButtonElement>(
      '[aria-label="Español"]',
    )!,
    english = document.querySelector<HTMLButtonElement>(
      '[aria-label="English"]',
    )!;
  spanish.focus();
  await act(() =>
    spanish.dispatchEvent(
      new browser.KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
      }) as unknown as Event,
    ),
  );
  expect(document.activeElement).toBe(english);
  expect(document.documentElement.lang).toBe("en");
  await act(() =>
    english.dispatchEvent(
      new browser.KeyboardEvent("keydown", {
        key: "Home",
        bubbles: true,
      }) as unknown as Event,
    ),
  );
  expect(document.activeElement).toBe(spanish);
  expect(document.documentElement.lang).toBe("es");
});
