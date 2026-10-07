import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PageTitle } from "@/app/(dashboard)/dashboard/_components/shared";
import { AccessControls } from "@/app/evaluation/access-controls";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { messages, ownedCopyKeys } from "@/i18n/messages";
import { UiProvider } from "@/i18n/provider";

vi.stubGlobal("React", React);
const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("app/globals.css");
const dashboard = read("app/(dashboard)/dashboard/_components/dashboard.css");
const declarations = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf("\n}", start) + 2);
};

describe("shared interface foundation", () => {
  it("centralizes authored light and dark semantic roles", () => {
    expect(declarations(":root")).toContain("--background: oklch(100% 0 0)");
    const dark = declarations(':root[data-dashboard-theme="dark"]');
    for (const value of [
      "--background: oklch(19% 0 0)",
      "--surface: oklch(21.5% 0 0)",
      "--surface-raised: oklch(24% 0 0)",
      "--surface-muted: oklch(26% 0 0)",
    ])
      expect(dark).toContain(value);
    expect(css).toContain("--muted-foreground: var(--text-secondary)");
    expect(dashboard).toContain("--dash-muted: var(--text-secondary)");
    expect(dashboard).toContain("--dash-bg: var(--background)");
    expect(dashboard).not.toMatch(/--dash-[\w-]+:\s*(?:#|oklch\()/);
  });

  it("owns theme once at the root and preserves the saved preference", () => {
    const root = read("app/layout.tsx");
    expect(root).toContain('attribute="data-dashboard-theme"');
    expect(root).toContain('storageKey="dashboard-theme"');
    expect(root).toContain('defaultTheme="system"');
    expect(read("app/(dashboard)/dashboard/layout.tsx")).not.toContain(
      "ThemeProvider",
    );
    expect(css).toMatch(/@custom-variant\s+dark\s*\(\s*&:where\(/);
    expect(css).toContain(":root:not([data-dashboard-theme])");
  });

  it("ships local variable fonts and their redistribution notices", () => {
    const root = read("app/layout.tsx");
    expect(root).toContain('from "next/font/local"');
    expect(root).not.toContain("next/font/google");
    for (const font of ["inter", "geist"]) {
      expect(root).toContain(`./fonts/${font}-variable.woff2`);
      const binary = readFileSync(
        new URL(`../app/fonts/${font}-variable.woff2`, import.meta.url),
      );
      expect(binary.subarray(0, 4).toString()).toBe("wOF2");
      expect(read(`app/fonts/${font}-license.txt`)).toContain(
        "SIL OPEN FONT LICENSE",
      );
    }
    expect(css).toContain("--font-display: var(--font-geist)");
    expect(css).toContain("--font-sans: var(--font-inter)");
    expect(css).toContain(
      '--font-mono: ui-monospace, "SFMono-Regular", Consolas, monospace',
    );
  });

  it("retains Button props and maps sizes to the shared control scale", () => {
    for (const [size, token] of [
      ["sm", "sm"],
      ["default", "md"],
      ["lg", "lg"],
    ] as const) {
      const html = renderToStaticMarkup(
        React.createElement(Button, { size }, "Action"),
      );
      expect(html).toContain(`data-size="${size}"`);
      expect(html).toContain(`h-[var(--control-height-${token})]`);
    }
    const html = renderToStaticMarkup(
      React.createElement(
        Button,
        { asChild: true, variant: "outline" },
        React.createElement("a", { href: "/dashboard" }, "Dashboard"),
      ),
    );
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain("<button");
    for (const [size, height] of [
      ["sm", 36],
      ["md", 44],
      ["lg", 50],
    ])
      expect(css).toContain(`--control-height-${size}: ${height}px`);
  });

  it("uses flat primary cards and role-specific concentric radii", () => {
    const html = renderToStaticMarkup(
      React.createElement(Card, null, "Content"),
    );
    expect(html).toContain("rounded-[var(--radius-surface)]");
    expect(html).not.toContain("shadow-");
    for (const [role, radius] of [
      ["control", 18],
      ["panel", 26],
      ["surface", 34],
      ["table", 14],
    ])
      expect(css).toContain(`--radius-${role}: ${radius}px`);
    expect(dashboard).toContain(
      "border-radius: calc(var(--radius-control) - 4px)",
    );
    const headings = dashboard.slice(
      dashboard.indexOf(".dc-card h2,"),
      dashboard.indexOf(".dc-panel-heading,"),
    );
    expect(headings).not.toMatch(/padding:|min-height:/);
    expect(dashboard).toContain("@container evidence-panel (max-width: 860px)");
    expect(dashboard).toContain("overflow-y: hidden");
    const selection = declarations('.ui-segment-option[aria-pressed="true"]');
    expect(selection).toContain("inset 0 0 0 1px var(--border)");
    expect(selection).not.toContain("--shadow-resting");
  });

  it("retains touch targets when Radix replaces the Button slot", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        UiProvider,
        { initialLocale: "en" },
        React.createElement(AccessControls, {
          error: "",
          onSignOut: async () => {},
        }),
      ),
    );
    expect(html).toContain('data-slot="dropdown-menu-trigger"');
    // Radix asChild forwards its slot over Button's data-slot="button".
    expect(declarations(".ui-access-mobile > button")).toContain(
      "min-height: 44px",
    );
    expect(css).toContain("@media (max-width: 767px), (pointer: coarse)");
    expect(css).toContain('[data-slot="dropdown-menu-item"]');
    expect(css).toContain('[data-slot="dialog-close"]');
    expect(read("components/ui/sheet.tsx")).toContain(
      'data-slot="sheet-close"',
    );
    expect(css).toContain("overscroll-behavior: contain");
  });

  it("renders dashboard headings without hidden, animated words", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        UiProvider,
        { initialLocale: "en" },
        React.createElement(PageTitle, {
          title: "Overview",
          description: "Stored mobility evidence",
        }),
      ),
    );
    expect(html).toContain('<h1 class="dc-page-title">Overview</h1>');
    expect(html).toContain("Stored mobility evidence");
    expect(html).not.toContain("opacity:0");
    expect(dashboard).toContain("font-size: clamp(30px, 3vw, 40px)");
  });

  it("localizes owned catalog headings and acquisition labels, not identifiers", () => {
    const translate = createTranslator({ locale: "es", messages: messages.es });
    expect(translate("toolView.places")).toBe("Lugares");
    for (const label of [
      "Journeys and timetables",
      "Mobility evidence",
      "System and coverage",
      "Publication",
      "On-demand refresh",
      "Graph activation",
      "Lease lost",
      "Lease recovered",
      "Roads DGT",
      "Madrid traffic sensors",
      "Madrid air quality",
      "EMT buses",
      "CRTM transport",
      "Madrid parking",
    ]) {
      const key = ownedCopyKeys[label];
      if (!key) throw new Error(`Missing owned label: ${label}`);
      expect(translate(key)).not.toBe(label);
    }
    expect(
      read("app/(dashboard)/dashboard/_components/tool-view.tsx"),
    ).toContain('group === "Places" ? t("toolView.places") : copy(group)');
    expect(
      read("app/(dashboard)/dashboard/_components/source-view.tsx"),
    ).toContain("([value, label]) => [value, copy(label)] as const");
    expect(
      read("app/(dashboard)/dashboard/_components/source-view.tsx").replace(
        /\s+/g,
        " ",
      ),
    ).toContain("copy(names[String(source.id)]) ?? String(source.id)");
    expect(translate("sourceView.notVerifiedPublicationTime")).toBe(
      "No es una hora de publicación verificada.",
    );
  });

  it("bounds motion and prevents pressed overlay triggers from scaling", () => {
    expect(css).toContain("--duration-instant: 120ms");
    expect(css).toContain("--duration-fast: 160ms");
    expect(css).toContain("--duration-standard: 240ms");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css.replace(/\s+/g, "")).toContain(
      ':not([aria-haspopup]):not([data-state]):not([role="combobox"])',
    );
    expect(css).toContain("transform: scale(0.97)");
    expect(dashboard).not.toContain("dc-theme-reveal");
    for (const component of ["button", "tabs", "sidebar"])
      expect(read(`components/ui/${component}.tsx`)).not.toContain(
        "transition-all",
      );
    expect(read("components/ui/sidebar.tsx")).not.toContain("duration-200");
    expect(dashboard).not.toContain("transition: opacity 150ms");
  });

  it("keeps the native chat hook and owner-keyed access controls separate", () => {
    const chat = read("app/_components/agent-chat.tsx");
    expect(chat).toContain("useEveAgent({");
    expect(chat).toContain("History.prototype.replaceState.call");
    expect(chat).toContain("maxFiles={0}");
    expect(chat).not.toContain("AccessControls");
    expect(read("app/evaluation/evaluation.tsx")).toMatch(
      /key=\{`access:\$\{identity\.principalId\}`\}/,
    );
    const controls = read("app/evaluation/access-controls.tsx");
    expect(controls).toContain("DropdownMenuGroup");
    expect(controls).toContain("onCloseAutoFocus");
    expect(controls).not.toContain("useEveAgent");
    expect(read("app/(dashboard)/dashboard/_components/shell.tsx")).toContain(
      '"--sidebar-width": "242px"',
    );
  });
});
