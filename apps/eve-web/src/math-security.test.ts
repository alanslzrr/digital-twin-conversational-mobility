import { createRequire } from "node:module";
import { math } from "@streamdown/math";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Streamdown } from "streamdown";
import { describe, expect, it } from "vitest";

const mathRequire = createRequire(import.meta.resolve("@streamdown/math"));
const katex: {
  renderToString: (
    expression: string,
    options?: { trust?: boolean; throwOnError?: boolean },
  ) => string;
} = mathRequire("katex");

describe("patched Markdown math dependencies", () => {
  it("renders display math through the installed Streamdown plugin", () => {
    const html = renderToStaticMarkup(
      createElement(
        Streamdown,
        { plugins: { math } },
        "$$\n\\frac{1}{2} + x^2\n$$",
      ),
    );
    expect(html).toContain('class="katex');
    expect(html).toContain("<math");
    expect(html).not.toContain("katex-error");
    const styles = math.getStyles?.();
    expect(styles).toBe("katex/dist/katex.min.css");
    if (typeof styles !== "string") throw new Error("Missing math stylesheet");
    expect(mathRequire.resolve(styles)).toMatch(/katex\.min\.css$/);
  });

  it("does not allow links through the default math plugin", () => {
    const html = renderToStaticMarkup(
      createElement(
        Streamdown,
        { plugins: { math } },
        "$$\n\\href{https://example.test}{link}\n$$",
      ),
    );
    expect(html).not.toContain('href="https://example.test"');
  });

  it("ignores inherited trust while retaining explicit KaTeX options", () => {
    const expression = "\\href{https://example.test}{link}";
    const inherited = Object.create({ trust: true }) as { trust?: boolean };
    expect(katex.renderToString(expression, inherited)).not.toContain(
      'href="https://example.test"',
    );
    expect(katex.renderToString(expression, { trust: true })).toContain(
      'href="https://example.test"',
    );
  });
});
