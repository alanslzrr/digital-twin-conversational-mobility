/** Isolated synthetic UI QA. Never submit a chat prompt or acquire provider data. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const cli = process.env.AGENT_BROWSER_BIN;
assert(
  cli,
  "Set AGENT_BROWSER_BIN to the installed CLI; run isolated --preview --synthetic-only first",
);
const session = `ui-i18n-${process.pid}`,
  origin = "http://127.0.0.1:3002";
const output = resolve("tmp/ui-i18n");
mkdirSync(output, { recursive: true });
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
const results = [];
const record = (name) => results.push({ name, ok: true });
const language = (locale) => {
  b(
    "find",
    "role",
    "button",
    "click",
    "--name",
    locale === "es" ? "Español" : "English",
  );
  assert.equal(evaluate("document.documentElement.lang"), locale);
};
try {
  b("open", `${origin}/evaluation`);
  b("cookies", "clear");
  b("reload");
  b("wait", "--text", "Correo");
  assert.equal(evaluate("document.documentElement.lang"), "es");
  record("Spanish first render without cookie");
  language("en");
  b("wait", "--text", "Email");
  assert(evaluate("document.cookie").includes("mobility-locale=en"));
  b("reload");
  b("wait", "--text", "Email");
  record("English persisted after reload without hydration mismatch");
  b("find", "label", "Email", "fill", "dashboard-qa-1@example.invalid");
  b("find", "label", "Password", "fill", "Synthetic-dashboard-password-1");
  b("find", "role", "button", "click", "--name", "Sign in");
  b("wait", "--fn", "!!document.querySelector('a[href=\"/dashboard\"]')");
  b("wait", "--fn", "!!document.querySelector('textarea')");
  evaluate(
    "window.__draft = document.querySelector('textarea'); window.__draft.focus(); window.__draft.value='Synthetic unsent draft'; window.__draft.dispatchEvent(new Event('input',{bubbles:true})); true",
  );
  language("es");
  assert(
    evaluate(
      "window.__draft === document.querySelector('textarea') && window.__draft.value === 'Synthetic unsent draft'",
    ),
  );
  language("en");
  assert(
    evaluate(
      "window.__draft === document.querySelector('textarea') && window.__draft.value === 'Synthetic unsent draft'",
    ),
  );
  record(
    "Chat input DOM and unsent draft survive both switches, no prompt submitted",
  );
  for (const width of [320, 390])
    for (const theme of ["light", "dark"]) {
      b("set", "viewport", String(width), "844");
      b("set", "media", theme, "reduced-motion");
      for (const page of [
        "",
        "mobility",
        "tools",
        "conversations",
        "sources",
        "activity",
      ]) {
        b("open", `${origin}/dashboard${page ? `/${page}` : ""}`);
        b("wait", "--fn", "!!document.querySelector('main h1')");
        // Theme remains independent and persistent; do not modify acquisition controls.
        evaluate(
          `localStorage.setItem('dashboard-theme',${JSON.stringify(theme)}); true`,
        );
        b("reload");
        b("wait", "--fn", "!!document.querySelector('main h1')");
        for (const locale of ["es", "en"]) {
          language(locale);
          b("wait", "250");
          const state = evaluate(
            "({width:innerWidth,scroll:document.documentElement.scrollWidth,lang:document.querySelector('.dashboard-shell')?.lang,title:document.querySelector('main h1')?.textContent})",
          );
          assert.equal(state.lang, locale);
          assert(
            state.scroll <= state.width + 1,
            JSON.stringify({ page, locale, theme, ...state }),
          );
          b(
            "screenshot",
            resolve(
              output,
              `${page || "overview"}-${width}-${theme}-${locale}.png`,
            ),
          );
          record(`${page || "overview"} ${width}px ${theme} ${locale}`);
        }
      }
    }
  b("open", `${origin}/dashboard/activity`);
  b("wait", "--fn", "!!document.querySelector('main h1')");
  language("en");
  b("find", "role", "button", "click", "--name", "Filters");
  // The installed CLI cannot fill datetime-local directly. Dispatch native input
  // events via the platform setter so React observes the actual controlled value.
  evaluate(
    'for (const [id,value] of [["event-from","2026-03-29T02:30"],["event-to","2026-03-29T04:00"]]) {const input=document.getElementById(id); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,value); input.dispatchEvent(new Event("input",{bubbles:true})); input.dispatchEvent(new Event("change",{bubbles:true}));} true',
  );
  b("find", "role", "button", "click", "--name", "Apply");
  b("wait", "--text", "Invalid or nonexistent local time");
  evaluate(
    "window.__detail=document.querySelector('[role=dialog]'); window.__filter=document.querySelector('#event-from'); true",
  );
  language("es");
  assert(
    evaluate(
      "window.__detail === document.querySelector('[role=dialog]') && window.__filter === document.querySelector('#event-from') && window.__filter.value === '2026-03-29T02:30'",
    ),
  );
  assert(
    !evaluate("window.__detail.textContent").includes(
      "Invalid or nonexistent local time",
    ),
  );
  record(
    "Open filter sheet, draft values and invalid civil-time error survive locale change",
  );
  language("en");
  b("find", "role", "button", "click", "--name", "Close details");
  b("open", `${origin}/dashboard/mobility?map=1&category=bikes`);
  b("wait", "--fn", "!!document.querySelector('.leaflet-container')");
  evaluate("window.__map = document.querySelector('.leaflet-container'); true");
  language("es");
  language("en");
  assert(
    evaluate("window.__map === document.querySelector('.leaflet-container')"),
  );
  record("Map DOM and URL filters preserved across switch");
  b("open", `${origin}/evaluation`);
  b("wait", "--fn", "!!document.querySelector('a[href=\"/dashboard\"]')");
  language("es");
  b("find", "role", "button", "click", "--name", "Cerrar sesión");
  b("wait", "--text", "Correo");
  assert.equal(evaluate("document.documentElement.lang"), "es");
  record("Logout preserves browser locale");
  const errors = b("errors");
  assert(!/hydration|MISSING_MESSAGE|FORMATTING_ERROR/i.test(errors), errors);
  record("No hydration or missing-message console errors");
  writeFileSync(
    resolve(output, "report.json"),
    JSON.stringify(
      {
        results,
        limitations: [
          "No live inference or provider acquisition. Streaming/resume and native Approve/Stop are exercised by isolated mocked DOM/unit tests, not live inference.",
        ],
      },
      null,
      2,
    ),
  );
  console.log(`${results.length} isolated UI checks passed; ${output}`);
} finally {
  b("close");
}
