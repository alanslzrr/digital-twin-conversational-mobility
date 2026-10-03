/** Reproducible synthetic dashboard screenshots; requires isolated QA --preview.
 * Uses the installed agent-browser 0.38.2, never user conversation accounts.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const cli = process.env.AGENT_BROWSER_BIN;
assert(cli, "Set AGENT_BROWSER_BIN to installed agent-browser 0.38.2");
const output = resolve(
  process.env.DASHBOARD_AUDIT_OUTPUT ?? "tmp/dashboard-redesign/application",
);
mkdirSync(output, { recursive: true });
const session = `redesign-${process.pid}`;
const origin = "http://127.0.0.1:3002";
const results = [];
const b = (...args) =>
  execFileSync(
    cli,
    [
      "--session",
      session,
      "--allowed-domains",
      "127.0.0.1,localhost,tile.openstreetmap.org",
      ...args,
    ],
    { encoding: "utf8", timeout: 60000 },
  ).trim();
const evaluate = (code) => JSON.parse(b("eval", code));
const save = (name, value) =>
  writeFileSync(
    resolve(output, name),
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
  );
function ready() {
  b(
    "wait",
    "--fn",
    "!!document.querySelector('main h1') && !document.body.innerText.includes('Loading stored data') && !document.body.innerText.includes('Waiting for the first successful')",
  );
}
try {
  assert.equal(b("--version"), "agent-browser 0.38.2");
  b("open", `${origin}/evaluation`);
  b("wait", "--text", "Correo");
  b("find", "label", "Correo", "fill", "dashboard-qa-1@example.invalid");
  b("find", "label", "Contraseña", "fill", "Synthetic-dashboard-password-1");
  b("find", "role", "button", "click", "--name", "Entrar");
  b("wait", "--text", "Panel");
  for (const theme of ["dark", "light"]) {
    b("set", "media", theme, "reduced-motion");
    for (const [width, height] of [
      [1440, 1000],
      [1280, 800],
      [1024, 768],
      [768, 1024],
      [390, 844],
      [320, 720],
    ]) {
      b("set", "viewport", String(width), String(height));
      for (const page of [
        "",
        "mobility",
        "tools",
        "sources",
        "activity",
        "conversations",
      ]) {
        b("open", `${origin}/dashboard${page ? `/${page}` : ""}`);
        ready();
        b("wait", "1000");
        const name = `${page || "overview"}-${theme}-${width}x${height}`;
        const layout = evaluate(
          "({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,lang:document.querySelector('.dashboard-shell')?.lang,metricY:document.querySelector('.dc-metric-grid')?.getBoundingClientRect().top,mapY:document.querySelector('.dc-map-stage')?.getBoundingClientRect().top})",
        );
        const a11y = JSON.parse(b("a11y", "--json")).data;
        save(`${name}-axe.json`, {
          counts: a11y.counts,
          violations: a11y.violations,
          incomplete: a11y.incomplete,
        });
        save(`${name}.txt`, b("snapshot"));
        b("screenshot", resolve(output, `${name}.png`));
        results.push({
          name,
          layout,
          violations: a11y.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodeCount,
          })),
          incomplete: a11y.incomplete.length,
        });
        save("results.json", results);
        assert.equal(
          layout.scrollWidth,
          layout.width,
          `${name}: document overflow`,
        );
        assert.equal(layout.lang, "en");
        assert.equal(
          a11y.violations.length,
          0,
          `${name}: accessibility violations`,
        );
      }
    }
  }
  console.log(
    `Captured ${results.length} synthetic views in both themes and six viewports; axe and overflow assertions passed.`,
  );
} finally {
  save("results.json", results);
  b("close");
}
