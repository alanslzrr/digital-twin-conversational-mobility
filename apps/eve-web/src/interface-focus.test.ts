// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AccessControls } from "@/app/evaluation/access-controls";
import {
  Sidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { UiProvider } from "@/i18n/provider";

it("restores the mobile access trigger after dismissing its conversation dialog", async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Keep the existing index request pending: no fabricated sessions are needed.
  const fetchIndex = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetchIndex);
  const originalMatchMedia = window.matchMedia.bind(window);
  const media = vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const result = originalMatchMedia(query);
    if (query === "(max-width: 1023px)")
      Object.defineProperty(result, "matches", { value: true });
    return result;
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() =>
      root.render(
        React.createElement(
          UiProvider,
          { initialLocale: "en" },
          React.createElement(AccessControls, {
            error: "",
            onSignOut: async () => {},
          }),
        ),
      ),
    );
    const trigger = host.querySelector<HTMLButtonElement>(
      '[data-slot="dropdown-menu-trigger"]',
    );
    if (!trigger) throw new Error("Missing access menu trigger");
    trigger.focus();
    await act(() =>
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      ),
    );
    const conversations =
      document.querySelector<HTMLElement>('[role="menuitem"]');
    if (!conversations) throw new Error("Missing conversations action");
    await act(() => conversations.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(fetchIndex).toHaveBeenCalledTimes(1);
    await act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  } finally {
    await act(() => root.unmount());
    host.remove();
    media.mockRestore();
    vi.unstubAllGlobals();
  }
});

it("restores mobile navigation focus after Escape without a Radix trigger", async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const originalWidth = window.innerWidth;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 390,
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() =>
      root.render(
        React.createElement(
          UiProvider,
          { initialLocale: "en" },
          React.createElement(
            SidebarProvider,
            null,
            React.createElement(SidebarTrigger),
            React.createElement(
              Sidebar,
              null,
              React.createElement("a", { href: "/dashboard" }, "Dashboard"),
            ),
          ),
        ),
      ),
    );
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-slot="sidebar-trigger"]',
    );
    if (!trigger) throw new Error("Missing sidebar trigger");
    trigger.focus();
    await act(() => trigger.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    // Radix restores focus on its zero-delay unmount cleanup.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  } finally {
    await act(() => root.unmount());
    host.remove();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalWidth,
    });
    vi.unstubAllGlobals();
  }
});

it("shows static, readable thinking text under reduced motion", async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const originalMatchMedia = window.matchMedia.bind(window);
  const media = vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const result = originalMatchMedia(query);
    if (query.includes("prefers-reduced-motion"))
      Object.defineProperty(result, "matches", { value: true });
    return result;
  });
  const { Shimmer } = await import("@/components/ai-elements/shimmer");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const props = { as: "span", children: "Thinking" } as const;
  try {
    await act(() => root.render(React.createElement(Shimmer, props)));
    const text = host.querySelector("span");
    if (!text) throw new Error("Missing thinking text");
    expect(text.textContent).toBe("Thinking");
    expect(text.style.backgroundImage).toBe("none");
    expect(text.className).toContain("text-muted-foreground");
    expect(text.className).not.toContain("text-transparent");
  } finally {
    await act(() => root.unmount());
    host.remove();
    media.mockRestore();
    vi.unstubAllGlobals();
  }
});
