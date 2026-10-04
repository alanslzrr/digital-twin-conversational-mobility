/** Mobile acceptance on the disposable authenticated QA preview, never real accounts. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const cli = process.env.AGENT_BROWSER_BIN;
assert(cli);
const output = resolve(
  process.env.DASHBOARD_AUDIT_OUTPUT ?? "tmp/dashboard-closure/mobile",
);
mkdirSync(output, { recursive: true });
const session = `mobile-closure-${process.pid}`;
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
const save = () =>
  writeFileSync(
    resolve(output, "results.json"),
    `${JSON.stringify(results, null, 2)}\n`,
  );
function click(name, role = "button") {
  b("find", "role", role, "click", "--name", name, "--exact");
}
function page(path = "") {
  b("open", `http://127.0.0.1:3002/dashboard${path}`);
  b(
    "wait",
    "--fn",
    "!!document.querySelector('.dashboard-shell main h1') && !document.body.innerText.includes('Loading stored data')",
  );
}
function inspect(name) {
  b(
    "wait",
    "--fn",
    "[...document.querySelectorAll('.dc-header [role=group]')].every(e=>getComputedStyle(e).opacity==='1')",
  );
  b("wait", "--fn", "!document.body.innerText.includes('Loading stored data')");
  const layout = evaluate(
    "({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.dashboardTheme,dialogs:[...document.querySelectorAll('[role=dialog]')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}})})",
  );
  const audit = JSON.parse(b("a11y", "--json")).data;
  results.push({
    name,
    layout,
    violations: audit.violations,
    incomplete: audit.incomplete.length,
  });
  save();
  b("screenshot", resolve(output, `${name}.png`));
  assert(layout.scrollWidth <= layout.width, `${name}: document overflow`);
  assert(
    layout.dialogs.every((d) => d.left >= -1 && d.right <= layout.width + 1),
    `${name}: dialog out of viewport`,
  );
  assert.equal(audit.violations.length, 0, `${name}: axe violations`);
}
try {
  b("open", "http://127.0.0.1:3002/evaluation");
  b("find", "label", "Correo", "fill", "dashboard-qa-1@example.invalid");
  b("find", "label", "Contraseña", "fill", "Synthetic-dashboard-password-1");
  click("Entrar");
  b("wait", "--text", "Panel");
  for (const theme of ["dark", "light"]) {
    b("set", "media", theme, "reduced-motion");
    for (const width of [320, 390]) {
      b("set", "viewport", String(width), "844");
      const suffix = `${theme}-${width}`;
      page();
      click("Toggle navigation");
      b("wait", "--fn", "!!document.querySelector('[role=dialog]')");
      inspect(`navigation-${suffix}`);
      for (let i = 0; i < 14; i++) {
        b("press", "Tab");
        assert(
          evaluate("!!document.activeElement?.closest('[role=dialog]')"),
          "Mobile navigation must retain focus",
        );
      }
      click("Mobility", "link");
      b(
        "wait",
        "--fn",
        "!document.querySelector('[role=dialog]') && location.pathname==='/dashboard/mobility' && !!document.querySelector('main h1')",
      );
      click("Map + list", "radio");
      b("wait", "--fn", "!!document.querySelector('.leaflet-container')");
      inspect(`map-${suffix}`);
      click("List", "radio");
      click("Filters");
      inspect(`filters-${suffix}`);
      click("Cancel");
      b("wait", "--fn", "!document.querySelector('[role=dialog]')");
      click("QA sintética · estación reciente");
      inspect(`evidence-${suffix}`);
      b("press", "Escape");
      page();
      const expanded = evaluate(
        "document.querySelector('button[aria-controls=dc-header-controls]')?.getAttribute('aria-expanded')",
      );
      if (expanded !== "true")
        b("click", "button[aria-controls=dc-header-controls]");
      b(
        "wait",
        "--fn",
        "!document.querySelector('#dc-header-controls[inert]')",
      );
      b(
        "wait",
        "--fn",
        `getComputedStyle(document.querySelector('#dc-header-controls')).opacity==='1' && [...document.querySelectorAll('#dc-header-controls button')].length===6 && [...document.querySelectorAll('#dc-header-controls button')].every(e=>{const r=e.getBoundingClientRect();return r.width>=39 && r.height>=43 && e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})`,
      );
      inspect(`header-${suffix}`);
      for (const choice of ["light", "dark", "system"]) {
        click(`Switch to ${choice} theme`);
        b(
          "wait",
          "--fn",
          `document.documentElement.dataset.dashboardTheme==='${choice === "system" ? theme : choice}'`,
        );
      }
      click("Pause refresh");
      b(
        "wait",
        "--fn",
        `!!document.querySelector('button[aria-label="Resume refresh"]')`,
      );
      click("Resume refresh");
      page("/tools/get_network_status");
      b("scrollintoview", "main form");
      inspect(`query-form-${suffix}`);
      page("/activity");
      click("Filters");
      inspect(`activity-filters-${suffix}`);
      b("press", "Escape");
      page("/conversations/qa-owned");
      click("Usage", "tab");
      inspect(`conversation-usage-${suffix}`);
      for (const detail of ["Timeline", "Tools", "Model", "Content"]) {
        click(detail, "tab");
        inspect(`conversation-${detail.toLowerCase()}-${suffix}`);
      }
      click("Open sanitized content");
      b("wait", "--text", "Synthetic isolated QA content");
      b("scrollintoview", "button:has-text('Close content')");
      inspect(`conversation-content-detail-${suffix}`);
      click("Close content");
    }
  }
  console.log(
    `${results.length} mobile states passed with navigation focus, theme, dialog and overflow checks`,
  );
} finally {
  save();
  writeFileSync(resolve(output, "last-snapshot.txt"), b("snapshot"));
  b("screenshot", resolve(output, "last.png"));
  b("close");
}
