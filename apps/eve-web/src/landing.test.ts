// @vitest-environment happy-dom
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ThemeProvider } from "next-themes";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingHeader } from "@/app/_components/landing/content";
import { HeroScene } from "@/app/_components/landing/hero-scene";
import { landingLinks } from "@/app/_components/landing/links";
import {
  integrationLogos,
  LogoMarquee,
} from "@/app/_components/landing/logo-marquee";
import {
  type PreviewView,
  ProductPreview,
} from "@/app/_components/landing/product-preview";
import { ProductStory } from "@/app/_components/landing/product-story";
import { VideoDemo } from "@/app/_components/landing/video-demo";
import HomePage from "@/app/page";
import { messages } from "@/i18n/messages";
import { UiProvider } from "@/i18n/provider";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
// Render locally served logo assets without the Next image runtime in DOM tests.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    unoptimized: _u,
    ...props
  }: {
    src: string | { src: string };
    alt: string;
    unoptimized?: boolean;
  }) =>
    React.createElement("img", {
      ...props,
      src: typeof src === "string" ? src : src.src,
      alt,
    }),
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const observers: {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  disconnect: ReturnType<typeof vi.fn>;
}[] = [];
let reduced = false;
const mediaListeners = new Set<() => void>();
let now = 0;
let frameId = 0;
const frames = new Map<number, FrameRequestCallback>();
function frame(ms: number) {
  now += ms;
  const callbacks = [...frames.values()];
  frames.clear();
  for (const callback of callbacks) callback(now);
}
async function mount(element: React.ReactNode, locale: "es" | "en" = "es") {
  await act(() =>
    root.render(
      React.createElement(
        ThemeProvider,
        {
          attribute: "data-dashboard-theme",
          storageKey: "dashboard-theme",
          defaultTheme: "light",
          enableSystem: true,
        },
        React.createElement(UiProvider, { initialLocale: locale }, element),
      ),
    ),
  );
}
async function dismiss() {
  await act(() =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
function button(text: string) {
  const result = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (node) =>
      node.textContent?.trim() === text ||
      node.getAttribute("aria-label") === text,
  );
  if (!result) throw new Error(`Missing button ${text}`);
  return result;
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Landing must not request business data");
    }),
  );
  observers.length = 0;
  frames.clear();
  now = 0;
  reduced = false;
  mediaListeners.clear();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query.includes("prefers-reduced-motion") && reduced,
        media: query,
        onchange: null,
        addEventListener: (_event: string, listener: () => void) => {
          mediaListeners.add(listener);
        },
        removeEventListener: (_event: string, listener: () => void) => {
          mediaListeners.delete(listener);
        },
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList,
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        observers.push({ callback, options, disconnect: this.disconnect });
      }
      observe() {}
      unobserve() {}
      disconnect = vi.fn();
    },
  );
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-dashboard-theme");
});

describe("public landing", () => {
  it("renders complete public copy and access links without any runtime requests", async () => {
    await mount(React.createElement(HomePage));
    expect(host.querySelector("h1")?.textContent).toBe(
      "Tu movilidad en Madrid,en una conversación.",
    );
    expect(
      host.querySelectorAll('a[href="/evaluation"]').length,
    ).toBeGreaterThanOrEqual(3);
    expect(host.querySelector('a[href="#producto"]')).not.toBeNull();
    for (const id of [
      "producto",
      "capacidades",
      "fuentes",
      "demo",
      "preguntas",
    ])
      expect(host.querySelector(`#${id}`)).not.toBeNull();
    expect(host.querySelectorAll("#preguntas details")).toHaveLength(5);
    expect(host.querySelector("iframe,video,form")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves ES/EN key parity and switches public copy without data calls", async () => {
    expect(Object.keys(messages.es.landing).sort()).toEqual(
      Object.keys(messages.en.landing).sort(),
    );
    await mount(React.createElement(HomePage));
    await act(() => button("EN").click());
    expect(host.querySelector("h1")?.textContent).toContain("Madrid");
    expect(host.textContent).toContain(messages.en.landing.exampleDisclaimer);
    expect(document.documentElement.lang).toBe("en");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps all copy and inline product examples in server-rendered HTML", () => {
    const html = renderToString(
      React.createElement(
        UiProvider,
        { initialLocale: "en" },
        React.createElement(HomePage),
      ),
    );
    expect(html).toContain(messages.en.landing.closingTitle);
    expect(html).toContain(messages.en.landing.faqAccessA);
    expect(html).toContain(messages.en.landing.exampleToolsHeading);
    expect(html).not.toContain("opacity:0");
  });
  it("restores mobile menu focus after Escape and inherits the root theme", async () => {
    await mount(React.createElement(LandingHeader));
    const trigger = button(messages.es.landing.menu);
    trigger.focus();
    await act(() => trigger.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement?.getAttribute("href")).toBe("#producto");
    const dark = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find(
      (node) => node.getAttribute("aria-label") === messages.es.locale.dark,
    );
    if (!dark) throw new Error("Missing shared theme control");
    await act(() => dark.click());
    expect(document.documentElement.getAttribute("data-dashboard-theme")).toBe(
      "dark",
    );
    await dismiss();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("renders labeled synthetic examples without screenshots, forms or data calls", async () => {
    for (const view of [
      "conversation",
      "tools",
      "context",
      "overview",
      "bikes",
    ] as PreviewView[]) {
      await mount(React.createElement(ProductPreview, { view }));
      expect(host.textContent).toContain(messages.es.landing.exampleLabel);
      expect(host.textContent).toContain(messages.es.landing.exampleDisclaimer);
      expect(host.querySelector("form,input")).toBeNull();
      expect(
        [...host.querySelectorAll("img")].every((image) =>
          image.src.includes("/brand/logo-"),
        ),
      ).toBe(true);
    }
    expect(host.textContent).toContain("—");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps native tool disclosures interactive without executing anything", async () => {
    await mount(React.createElement(ProductPreview, { view: "tools" }));
    const details = host.querySelector("details");
    expect(details?.open).toBe(false);
    expect(details?.querySelector("summary")?.textContent).toBe(
      "mobility__resolve_place",
    );
    expect(details?.querySelector("dl")?.textContent).toContain("Renfe");
    expect(details?.querySelector("dl")?.textContent).not.toContain(
      messages.es.landing.exampleDestination,
    );

    await act(() => details?.querySelector("summary")?.click());
    expect(details?.open).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("selects synthetic evidence views without modifying the stored-data dashboard", async () => {
    await mount(React.createElement(ProductStory));
    const bikes = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (node) => node.textContent === "BiciMAD",
    );
    if (!bikes) throw new Error("Missing evidence selector");
    await act(() => bikes.click());
    expect(host.querySelector('[data-preview="bikes"]')).not.toBeNull();
    expect(bikes.getAttribute("aria-pressed")).toBe("true");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("loads the recorded video only after an explicit play action and exposes a fallback", async () => {
    await mount(React.createElement(VideoDemo), "en");
    expect(host.querySelector("video,iframe")).toBeNull();
    await act(() => button(messages.en.landing.playDemo).click());
    const video = host.querySelector("video");
    expect(video?.getAttribute("src")).toBe(landingLinks.video);
    expect(video?.getAttribute("preload")).toBe("none");
    expect(video?.controls).toBe(true);
    expect(video?.querySelector("track")?.getAttribute("src")).toBe(
      "/demo/captions-en.vtt",
    );
    expect(document.activeElement).toBe(video);
    await act(() => video?.dispatchEvent(new Event("error")));
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      messages.en.landing.demoError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("pauses logos on manual pause, invisibility and reduced motion and removes observers", async () => {
    await mount(React.createElement(LogoMarquee));
    const running = () =>
      host.querySelector("[data-running]")?.getAttribute("data-running");
    expect(running()).toBe("false");
    await act(() =>
      observers[0]?.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(running()).toBe("true");
    await act(() => button(messages.es.landing.pauseLogos).click());
    expect(running()).toBe("false");
    await act(() => button(messages.es.landing.resumeLogos).click());
    await act(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(running()).toBe("false");
    await act(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(running()).toBe("true");
    await act(() => {
      reduced = true;
      for (const listener of mediaListeners) listener();
    });
    expect(running()).toBe("false");
    expect(host.querySelectorAll("ul:not([aria-hidden]) li")).toHaveLength(
      integrationLogos.length,
    );
    expect(host.querySelector('ul[aria-hidden="true"]')).not.toBeNull();
    await act(() => root.render(null));
    expect(observers[0]?.disconnect).toHaveBeenCalled();
    expect(mediaListeners.size).toBe(0);
  });
  it("serves original logos locally without executable or external SVG content", () => {
    const files = integrationLogos.flatMap((logo) => [
      logo.file,
      ...(logo.darkFile ? [logo.darkFile] : []),
    ]);
    for (const file of files) {
      const bytes = readFileSync(
        `apps/eve-web/public/brand/integrations/${file}`,
      );
      expect(bytes.length).toBeGreaterThan(100);
      if (file.endsWith(".svg")) {
        const source = bytes.toString();
        expect(source).not.toMatch(
          /<script|<foreignObject|onload=|(?:href|src)=["']https?:/i,
        );
      }
    }
    expect(
      readFileSync(
        "apps/eve-web/public/brand/integrations/LICENSE-thesvg",
        "utf8",
      ),
    ).toContain("MIT License");
  });
  it("keeps logos unboxed and preserves the standalone AEMET paths with theme-aware negatives", async () => {
    const css = readFileSync(
      "apps/eve-web/app/_components/landing/showcase.module.css",
      "utf8",
    );
    for (const selector of ["integrations", "logoAsset"]) {
      const rule = css.match(
        new RegExp(`\\.${selector}\\s*\\{([^}]+)\\}`),
      )?.[1];
      expect(rule).toBeDefined();
      expect(rule).not.toMatch(/background|border|box-shadow/);
    }
    expect(css).toContain('[data-dashboard-theme="dark"] .logoLight');
    expect(css).toContain('[data-dashboard-theme="dark"] .logoDark');
    expect(css).toContain("filter: brightness(0) invert(1)");
    expect(css).toMatch(
      /\.marquee\[data-reduced="true"\] \.logoGroup\s*{\s*width: 100%/,
    );
    const source = readFileSync(
      "apps/eve-web/public/brand/integrations/aemet.svg",
      "utf8",
    );
    const provenance = JSON.parse(
      readFileSync(
        "apps/eve-web/public/brand/integrations/sources.json",
        "utf8",
      ),
    );
    expect(source).not.toMatch(/<image|<rect|#f7d117|#f5e326/);
    const path = source.match(/<path[^>]* d="([^"]+)"/)?.[1];
    expect(path).toBeDefined();
    expect(
      createHash("sha256")
        .update(path ?? "")
        .digest("hex"),
    ).toBe(provenance.aemetAdaptation.pathSha256);
    await mount(React.createElement(LogoMarquee));
    expect(host.querySelector('img[src$="nextjs-dark.svg"]')).not.toBeNull();
    expect(host.querySelector('img[src$="eve-dark.svg"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-negative="true"]')).toHaveLength(4);
    expect(
      integrationLogos.find((logo) => logo.name === "Renfe")?.negativeOnDark,
    ).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns menu focus to the visible brand link when the trigger becomes hidden", async () => {
    await mount(React.createElement(LandingHeader));
    const trigger = button(messages.es.landing.menu);
    trigger.focus();
    await act(() => trigger.click());
    const home = host.querySelector<HTMLAnchorElement>('a[href="/"]');
    if (!home) throw new Error("Missing home link");
    vi.spyOn(trigger, "getClientRects").mockReturnValue(
      [] as unknown as DOMRectList,
    );
    vi.spyOn(home, "getClientRects").mockReturnValue([
      new DOMRect(0, 0, 100, 44),
    ] as unknown as DOMRectList);
    await dismiss();
    expect(document.activeElement).toBe(home);
  });
  it("reserves a stable desktop preview and stacks it in short or reduced-motion viewports", () => {
    const styles = readFileSync(
      "apps/eve-web/app/_components/landing/landing.module.css",
      "utf8",
    );

    expect(styles).toContain(".stickyInner .storyToolbar");
    expect(styles).toContain(
      "(prefers-reduced-motion: reduce), (max-height: 849px)",
    );
    expect(styles).toMatch(
      /\.evidenceSelector button,\s*\.footerMain nav a\s*{\s*min-height: 44px/,
    );
    expect(styles).toMatch(/\.sceneControls \.playButton\s*{\s*width: 44px/);
    const showcase = readFileSync(
      "apps/eve-web/app/_components/landing/showcase.module.css",
      "utf8",
    );
    expect(showcase).toMatch(
      /@media \(max-width: 359px\)\s*{\s*\.videoFrame\s*{\s*aspect-ratio: 1;/,
    );
  });
  it("uses a height-based centerline for scroll story steps and rebuilds it on resize", async () => {
    await mount(React.createElement(ProductStory));
    expect(observers[0]?.options?.rootMargin).toMatch(
      /^-\d+px 0px -\d+px 0px$/,
    );
    const rows = host.querySelectorAll("[data-step]");
    await act(() =>
      observers[0]?.callback(
        [
          {
            isIntersecting: true,
            target: rows[1],
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      ),
    );
    expect(
      host.querySelector('[data-active="true"]')?.getAttribute("data-step"),
    ).toBe("1");
    await act(() =>
      observers[0]?.callback(
        [
          {
            isIntersecting: true,
            target: rows[3],
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      ),
    );
    expect(
      host.querySelector('[data-active="true"]')?.getAttribute("data-step"),
    ).toBe("3");
    await act(() => window.dispatchEvent(new Event("resize")));
    expect(observers[0]?.disconnect).toHaveBeenCalled();
    expect(observers).toHaveLength(2);
    await act(() => root.render(null));
    expect(observers[1]?.disconnect).toHaveBeenCalled();
    await act(() => window.dispatchEvent(new Event("resize")));
    expect(observers).toHaveLength(2);
  });

  it("keeps authentication on the separate chat entry, not the root", () => {
    const source = readFileSync("apps/eve-web/app/page.tsx", "utf8");
    expect(source).not.toMatch(
      /EvaluationAccess|AgentChat|DashboardProvider|authClient/,
    );
    expect(source).toContain("index: false");
    const chat = readFileSync("apps/eve-web/app/evaluation/page.tsx", "utf8");
    expect(chat).toContain("EvaluationAccess");
    expect(chat).toContain("AgentChat");
  });
});

describe("visible-time scene controller", () => {
  async function visible(value: boolean) {
    await act(() =>
      observers[0]?.callback(
        [{ isIntersecting: value } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
  }
  const current = () =>
    host.querySelector('[aria-current="step"]')?.textContent;
  it("stops offscreen and in hidden tabs, resumes in place, and cancels on unmount", async () => {
    await mount(React.createElement(HeroScene));
    expect(frames.size).toBe(0);
    await visible(true);
    await act(() => frame(2400));
    expect(current()).toContain(messages.es.landing.flowPlaces);
    await visible(false);
    await act(() => frame(60000));
    expect(current()).toContain(messages.es.landing.flowPlaces);
    await visible(true);
    await act(() => frame(2400));
    expect(current()).toContain(messages.es.landing.flowData);
    await act(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(frames.size).toBe(0);
    await act(() => frame(60000));
    expect(current()).toContain(messages.es.landing.flowData);
    await act(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(() => frame(5600));
    expect(current()).toContain(messages.es.landing.flowProvenance);
    await act(() => root.render(null));
    expect(frames.size).toBe(0);
    expect(observers[0]?.disconnect).toHaveBeenCalled();
  });
  it("pauses on stage selection and only advances after explicit resume", async () => {
    await mount(React.createElement(HeroScene));
    await visible(true);
    const step = [...host.querySelectorAll<HTMLButtonElement>("ol button")][4];
    if (!step) throw new Error("Missing step");
    await act(() => step.click());
    expect(current()).toContain(messages.es.landing.flowAnswer);
    expect(frames.size).toBe(0);
    await act(() => button(messages.es.landing.play).click());
    await act(() => frame(3200));
    expect(current()).toContain(messages.es.landing.flowQuestion);
    await act(() => button(messages.es.landing.pause).click());
    expect(frames.size).toBe(0);
  });
  it("uses a static particle-free scene under reduced motion with immediate manual selection", async () => {
    reduced = true;
    await mount(React.createElement(HeroScene));
    await visible(true);
    expect(frames.size).toBe(0);
    expect(host.querySelectorAll("[data-flow-particle]")).toHaveLength(0);
    expect(button(messages.es.landing.staticMotion).disabled).toBe(true);
    const step = [...host.querySelectorAll<HTMLButtonElement>("ol button")][2];
    if (!step) throw new Error("Missing step");
    await act(() => step.click());
    expect(current()).toContain(messages.es.landing.flowData);
    expect(frames.size).toBe(0);
  });
  it("responds to a changed motion preference and removes observers on teardown", async () => {
    await mount(React.createElement(HeroScene));
    await visible(true);
    await act(() => frame(2400));
    await act(() => {
      reduced = true;
      for (const listener of mediaListeners) listener();
    });
    expect(frames.size).toBe(0);
    expect(host.querySelectorAll("[data-flow-particle]")).toHaveLength(0);
    await act(() => frame(60000));
    expect(current()).toContain(messages.es.landing.flowPlaces);
    await act(() => {
      reduced = false;
      for (const listener of mediaListeners) listener();
    });
    await act(() => frame(2400));
    expect(current()).toContain(messages.es.landing.flowData);
    await act(() => root.render(null));
    expect(mediaListeners.size).toBe(0);
    expect(frames.size).toBe(0);
  });
});
