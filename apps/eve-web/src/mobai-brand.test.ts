import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const paths = (svg: string) =>
  [...svg.matchAll(/<path\s+d="([^"]+)"/g)].map((match) => match[1]);

describe("mobai brand assets", () => {
  for (const [mode, fill] of [
    ["light", "#171717"],
    ["dark", "#FAFAFA"],
  ]) {
    it(`preserves original ${mode} geometry and neutral fill without a background`, () => {
      const shipped = read(`apps/eve-web/public/brand/logo-${mode}.svg`);
      expect(
        createHash("sha256")
          .update(JSON.stringify(paths(shipped)))
          .digest("hex"),
      ).toBe(
        "dc40117cad8db2fba06eb4c45615216d474c4e277f6aeed61b5d2d96ea621cfd",
      );
      expect(paths(shipped).length).toBeGreaterThan(0);
      expect(shipped).toContain(`fill="${fill}"`);
      expect(shipped).toContain('viewBox="360 341 534 534"');
      expect(shipped).not.toMatch(/<(rect|image|script|foreignObject)\b/);
    });
  }
  it("ships a local system-aware favicon preserving the same geometry", () => {
    const icon = read("apps/eve-web/public/brand/favicon.svg");
    expect(paths(icon)).toEqual(
      paths(read("apps/eve-web/public/brand/logo-light.svg")),
    );
    expect(icon).toContain("prefers-color-scheme: dark");
    expect(icon).toContain("#FAFAFA");
  });
  it("overrides system appearance with explicit dashboard theme without hydration-dependent assets", () => {
    const css = read("apps/eve-web/app/globals.css");
    for (const [theme, mode] of [
      ["light", "light"],
      ["dark", "dark"],
    ]) {
      expect(css).toContain(
        `[data-dashboard-theme="${theme}"] .mobai-brand-symbol .mobai-logo-${mode}`,
      );
    }
    const component = read("apps/eve-web/components/mobai-brand.tsx");
    expect(component).not.toMatch(/useEffect|useTheme|fetch\(/);
    expect(component).toContain('aria-hidden="true"');
    expect(component).toContain('alt=""');
  });
});
