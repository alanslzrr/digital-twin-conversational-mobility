/** Synthetic authenticated application regressions, never the normal installation. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const cli = process.env.AGENT_BROWSER_BIN;
assert(cli);
const output = resolve(
  process.env.DASHBOARD_AUDIT_OUTPUT ?? "tmp/dashboard-redesign/interactions",
);
mkdirSync(output, { recursive: true });
const session = `redesign-interactions-${process.pid}`,
  origin = "http://127.0.0.1:3002",
  report = [];
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
function check(name, ok) {
  report.push({ name, ok });
  save("results.json", report);
  assert(ok, name);
}
function ready() {
  b(
    "wait",
    "--fn",
    "!!document.querySelector('main h1') && !document.body.innerText.includes('Loading stored data')",
  );
}
function page(path) {
  b("open", `${origin}/dashboard${path}`);
  ready();
}
function reference(name, role = "button") {
  const line = b("snapshot", "-i")
    .split("\n")
    .find(
      (line) => line.includes(`${role} "${name}"`) && line.includes("ref="),
    );
  assert(line, `Missing ${role}: ${name}`);
  return `@${line.match(/ref=([^\],]+)/)[1]}`;
}
function click(name, role = "button") {
  b("click", reference(name, role));
}
function inspect(name) {
  const audit = JSON.parse(b("a11y", "--json")).data;
  save(`${name}-axe.json`, audit);
  check(`${name}: no axe violations`, audit.violations.length === 0);
  save(`${name}.txt`, b("snapshot"));
  b("screenshot", resolve(output, `${name}.png`));
}
function text() {
  return evaluate("document.body.innerText");
}
try {
  b("open", `${origin}/evaluation`);
  b("wait", "--text", "Correo");
  b("find", "label", "Correo", "fill", "dashboard-qa-1@example.invalid");
  b("find", "label", "Contraseña", "fill", "Synthetic-dashboard-password-1");
  click("Entrar");
  b("wait", "--text", "Panel");
  b("set", "viewport", "1440", "1000");
  b("set", "media", "dark", "reduced-motion");
  page("");
  b("network", "requests", "--clear");
  b("press", "Tab");
  check(
    "keyboard skip link",
    evaluate("document.activeElement?.textContent") === "Skip to content",
  );
  b("press", "Enter");
  check(
    "skip target main",
    evaluate("document.activeElement?.id") === "dashboard-main",
  );
  // Native CSS/browser zoom equivalence is supplemented by keyboard zoom below.
  b("wait", "--text", "Comparison unavailable");
  const definitions = evaluate(
    "[...document.querySelectorAll('button')].filter(b=>b.getAttribute('aria-label')?.endsWith(' definition')).length",
  );
  check("four definition actions", definitions === 4);
  click("Available bikes definition");
  b("wait", "--text", "definition");
  inspect("definition-dark");
  b("press", "Escape");
  check(
    "definition restores keyboard focus",
    evaluate("document.activeElement?.getAttribute('aria-label')") ===
      "Available bikes definition",
  );
  click("Data timing");
  inspect("timing-dark");
  b("press", "Escape");
  b("set", "media", "light", "reduced-motion");
  page("");
  b("wait", "--text", "Comparison unavailable");
  click("Data timing");
  inspect("timing-light");
  b("press", "Escape");
  b("set", "media", "dark", "reduced-motion");
  page("/mobility");
  click("Zoom in");
  b("wait", "400");
  b(
    "find",
    "role",
    "button",
    "click",
    "--name",
    "QA sintética · estación reciente",
    "--exact",
  );
  inspect("mobility-evidence");
  b("press", "Escape");
  check(
    "evidence restores row focus",
    evaluate(
      "document.activeElement?.textContent?.includes('estación reciente')",
    ),
  );
  click("Filters");
  b("select", reference("Source", "combobox"), "bicimad");
  click("Cancel");
  check(
    "cancel does not apply source",
    !evaluate("location.search.includes('source=')"),
  );
  click("Filters");
  b("select", reference("Source", "combobox"), "bicimad");
  click("Apply");
  b("wait", "400");
  check(
    "apply resets explorer cursor",
    evaluate(
      "location.search.includes('source=bicimad')&&!location.search.includes('cursor=')",
    ),
  );
  page("/activity");
  click("Filters");
  evaluate(
    "(()=>{const i=document.querySelector('#event-from');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'2026-03-29T02:30');i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));return i.value;})()",
  );
  b("press", "Tab");
  b("wait", "300");
  save(
    "dst-input-value.txt",
    evaluate("document.querySelector('#event-from')?.value"),
  );
  click("Apply");
  b("wait", "300");
  check(
    "reject nonexistent Madrid time",
    text().includes("nonexistent local time"),
  );
  evaluate(
    "(()=>{const i=document.querySelector('#event-from');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'2026-10-25T02:30');i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));return i.value;})()",
  );
  b("press", "Tab");
  b("wait", "300");
  click("Apply");
  b("wait", "300");
  check("ambiguous offset required", text().includes("choose its UTC offset"));
  inspect("activity-dst");
  click("Cancel");
  const lane = evaluate("!!document.querySelector('.rf-bin')");
  check("chart has keyboard interval inspector", lane);
  evaluate("document.querySelector('.rf-bin[tabindex=\"0\"]').focus(); true");
  b("press", "ArrowRight");
  check("count interval readout", text().includes("Publications"));
  const requests = b("network", "requests", "--method", "POST");
  check(
    "navigation filters chart and map never execute tools",
    !requests.includes("/executions"),
  );
  page("/sources");
  const before = evaluate(
    "document.querySelector('.dc-read-label')?.textContent",
  );
  b("network", "route", "**/api/dashboard/sources?*", "--abort");
  b("wait", "16000");
  click("Refresh stored data");
  b("wait", "--text", "Cached source evidence");
  check("cached source evidence retained", text().includes("Source products"));
  check(
    "successful read time retained after failed refresh",
    evaluate(
      "document.querySelector('.dc-read-label')?.textContent?.includes(" +
        JSON.stringify(before.replace(/^Read /, "")) +
        ")",
    ),
  );
  inspect("sources-cached-failure");
  page("/sources");
  b("wait", "--text", "Source evidence unavailable");
  check(
    "first source failure not empty groups",
    !text().includes("Source products") &&
      !text().includes("Products with recorded current issues"),
  );
  inspect("sources-first-failure");
  b("network", "unroute");
  page("/sources");
  b("network", "route", "**/api/dashboard/status", "--abort");
  b("wait", "3500");
  b("scrollintoview", "#worker-signals");
  b("wait", "--text", "Refresh failed.");
  check(
    "worker fetch failure preserves source evidence",
    text().includes("Source products") &&
      !text().includes("Source evidence unavailable"),
  );
  inspect("worker-fetch-failure");
  b("network", "unroute");
  page("/tools/get_bike_availability");
  click("Load example without execution");
  click("Run query", "radio");
  b(
    "find",
    "label",
    "I confirm explicit execution and its declared effects",
    "check",
  );
  b(
    "network",
    "route",
    "**/api/dashboard/executions*",
    "--body",
    JSON.stringify({
      schemaVersion: 1,
      truncated: false,
      nextCursor: null,
      readAt: new Date().toISOString(),
      data: { state: "outcome_unknown" },
    }),
  );
  click("Run query");
  b("wait", "--text", "Execution outcome unknown");
  check(
    "unknown outcome prevents repeat execution",
    evaluate(
      "[...document.querySelectorAll('button')].find(b=>b.textContent==='Run query')?.disabled",
    ),
  );
  inspect("unknown-execution");
  click("Recover status by request ID");
  b("wait", "300");
  check(
    "unknown recovery remains blocked",
    evaluate(
      "[...document.querySelectorAll('button')].find(b=>b.textContent==='Run query')?.disabled",
    ),
  );
  b("network", "unroute");
  page("/conversations");
  b(
    "find",
    "role",
    "link",
    "click",
    "--name",
    "Inspect conversation",
    "--exact",
  );
  ready();
  click("Usage", "tab");
  inspect("conversation-usage");
  check("token subset labeling", text().includes("Cache (input subset)"));
  // 200% browser zoom: browser-wide zoom controls differ by host. CSS zoom is explicit additional layout coverage, not claimed as a native zoom test.
  page("");
  evaluate("document.documentElement.style.zoom='2'; true");
  inspect("overview-css-200-percent");
  check(
    "200 percent equivalent layout has no document overflow",
    evaluate("document.documentElement.scrollWidth<=innerWidth"),
  );
  evaluate("document.documentElement.style.zoom='';true");
  b("set", "viewport", "390", "844");
  page("");
  click("Toggle navigation");
  inspect("navigation-mobile");
  b("press", "Escape");
  // Revoke only this disposable account's session through its existing authenticated path.
  evaluate(
    "fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.ok)",
  );
  click("Refresh stored data");
  b("wait", "--text", "Correo");
  check(
    "revoked session removes private dashboard",
    !evaluate("!!document.querySelector('.dashboard-shell')"),
  );
  b("find", "label", "Correo", "fill", "dashboard-qa-2@example.invalid");
  b("find", "label", "Contraseña", "fill", "Synthetic-dashboard-password-2");
  click("Entrar");
  b("wait", "--text", "Panel");
  b(
    "network",
    "route",
    "**/api/dashboard/conversations",
    "--body",
    JSON.stringify({
      schemaVersion: 1,
      truncated: false,
      nextCursor: null,
      readAt: new Date().toISOString(),
      data: { sessions: [], nextCursor: null },
    }),
  );
  page("/conversations");
  b("wait", "--text", "No captured conversations yet");
  check(
    "empty conversations offers chat next step",
    text().includes("Open chat"),
  );
  inspect("conversations-empty-second-owner");
  b("network", "unroute");
  console.log(`${report.length} synthetic interaction assertions passed`);
} finally {
  save("results.json", report);
  save("last-snapshot.txt", b("snapshot"));
  b("screenshot", resolve(output, "last.png"));
  b("close");
}
