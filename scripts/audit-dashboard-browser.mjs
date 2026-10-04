/** Opt-in browser audit. Run test-dashboard-local.mjs --preview first.
 * AGENT_BROWSER_BIN must point to the agent-browser 0.38.2 CLI executable.
 * Uses real Better Auth with disposable accounts; never the usual installation.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const cli = process.env.AGENT_BROWSER_BIN;
assert(cli, "Set AGENT_BROWSER_BIN to an installed agent-browser executable");
const output = resolve(
  process.env.DASHBOARD_AUDIT_OUTPUT ?? "tmp/dashboard-second-audit",
);
mkdirSync(output, { recursive: true });
const session = `dashboard-audit-${process.pid}`;
const origin = "http://127.0.0.1:3002";
const results = [];
function browser(...args) {
  return execFileSync(
    cli,
    [
      "--session",
      session,
      "--allowed-domains",
      "127.0.0.1,localhost,tile.openstreetmap.org",
      ...args,
    ],
    { encoding: "utf8", timeout: 45000 },
  ).trim();
}
function save(name, data) {
  writeFileSync(
    resolve(output, name),
    typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`,
  );
}
function evaluate(code) {
  return JSON.parse(browser("eval", code));
}
function snapshot() {
  return browser("snapshot", "-i");
}
function ref(tree, label, role) {
  const line = tree
    .split("\n")
    .find(
      (line) => line.includes(`${role} "${label}"`) && line.includes("ref="),
    );
  if (!line) save("failed-snapshot.txt", tree);
  assert(line, `Missing ${role}: ${label}`);
  return `@${line.match(/ref=([^\],]+)/)[1]}`;
}
function click(label, role = "button") {
  const target = ref(snapshot(), label, role);
  browser("scrollintoview", target);
  browser("click", target);
}
function ready() {
  browser(
    "wait",
    "--fn",
    "!!document.querySelector('main h1') && !document.body.innerText.includes('Cargando')",
  );
}
function inspect(name, screenshot = true) {
  ready();
  // Pace this deliberately dense audit below the existing 120 reads/minute cap.
  browser("wait", "2000");
  const audit = JSON.parse(browser("a11y", "--json")).data;
  const layout = evaluate(
    "({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,light:matchMedia('(prefers-color-scheme: light)').matches})",
  );
  save(`${name}-axe.json`, {
    axeVersion: audit.axeVersion,
    counts: audit.counts,
    violations: audit.violations,
    incomplete: audit.incomplete,
  });
  save(`${name}.txt`, snapshot());
  if (screenshot)
    browser(
      "--screenshot-format",
      "jpeg",
      "--screenshot-quality",
      "70",
      "screenshot",
      resolve(output, `${name}.jpg`),
    );
  results.push({
    name,
    layout,
    violations: audit.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodeCount,
    })),
    incomplete: audit.incomplete.length,
  });
  save("results.json", results);
  assert.equal(layout.scrollWidth, layout.width, `${name}: document overflow`);
  assert.equal(audit.violations.length, 0, `${name}: accessibility violations`);
}
try {
  assert.equal(
    browser("--version"),
    "agent-browser 0.38.2",
    "Use the audited CLI version",
  );
  browser("open", `${origin}/evaluation`);
  browser("wait", "--text", "Correo");
  browser(
    "fill",
    ref(snapshot(), "Correo", "textbox"),
    "dashboard-qa-1@example.invalid",
  );
  browser(
    "fill",
    ref(snapshot(), "Contraseña", "textbox"),
    "Synthetic-dashboard-password-1",
  );
  click("Entrar");
  browser("wait", "--text", "Panel");
  click("Panel", "link");
  for (const theme of ["dark", "light"]) {
    browser("set", "media", theme, "reduced-motion");
    for (const [width, height] of [
      [1440, 900],
      [1280, 720],
      [768, 1024],
      [390, 844],
    ]) {
      browser("set", "viewport", String(width), String(height));
      for (const section of [
        "",
        "mobility",
        "tools",
        "sources",
        "activity",
        "conversations",
      ]) {
        browser("open", `${origin}/dashboard${section ? `/${section}` : ""}`);
        inspect(`${section || "overview"}-${width}-${theme}`);
      }
    }
  }
  browser("set", "viewport", "1440", "900");
  // Derive actual tool URLs from the rendered catalog, not guessed names.
  browser("open", `${origin}/dashboard/tools`);
  browser(
    "wait",
    "--fn",
    "document.querySelectorAll('main a[href*=\"/dashboard/tools/\"]').length === 16",
  );
  const paths = evaluate(
    "Array.from(document.querySelectorAll('main a[href*=\"/dashboard/tools/\"]'),a=>a.getAttribute('href'))",
  );
  assert.equal(paths.length, 16);
  for (const path of paths) {
    browser("open", `${origin}${path}`);
    browser("wait", "--text", "Cargar ejemplo sin ejecutarlo");
    click("Cargar ejemplo sin ejecutarlo");
    inspect(`form-${path.split("/").at(-1)}`, false);
    assert(
      snapshot().includes('button "Ejecutar herramienta" [disabled'),
      "Manual execution requires confirmation",
    );
  }
  // Functional paths use mouse/keyboard actions, not direct application APIs.
  browser("open", `${origin}/dashboard/mobility?category=bikes&search=QA`);
  browser("wait", "--text", "QA sintética · estación reciente");
  assert(
    evaluate("!!history.state?.__NA"),
    "URL synchronization preserves router state",
  );
  click("QA sintética · estación reciente", "link");
  browser("wait", "--fn", "location.pathname.endsWith('/bikes/qa-recent')");
  click("Consultar histórico guardado");
  browser("wait", "--text", "Periodo retenido");
  inspect("entity-history-light");
  click("Volver al explorador", "link");
  browser(
    "wait",
    "--fn",
    "location.pathname === '/dashboard/mobility' && location.search.includes('search=QA')",
  );
  browser("network", "route", "https://tile.openstreetmap.org/**", "--abort");
  click("Mostrar mapa");
  browser("wait", "--text", "Fondo cartográfico no disponible");
  click("Acercar mapa");
  browser(
    "wait",
    "--fn",
    "new URLSearchParams(location.search).get('zoom') === '13'",
  );
  inspect("map-fallback-light");
  const targets = evaluate(
    "Array.from(document.querySelectorAll('.leaflet-control-zoom a'),a=>a.getBoundingClientRect().height)",
  );
  assert(
    targets.every((h) => h >= 44),
    "Map zoom controls have 44px hit areas",
  );
  click("QA sintética · estación reciente", "link");
  browser("wait", "--fn", "location.pathname.endsWith('/bikes/qa-recent')");
  click("Volver al explorador", "link");
  browser(
    "wait",
    "--fn",
    "location.pathname === '/dashboard/mobility' && new URLSearchParams(location.search).get('zoom') === '13'",
  );
  browser("network", "unroute");
  browser("focus", ref(snapshot(), "Datos que cambian", "tab"));
  browser("press", "ArrowRight");
  browser(
    "wait",
    "--fn",
    "document.querySelector('#reference-product') !== null",
  );
  browser("select", "#reference-product", "reference:accessibility");
  browser("reload");
  browser(
    "wait",
    "--fn",
    "document.querySelector('#reference-product')?.value === 'reference:accessibility'",
  );
  browser("wait", "--text", "Accesibilidad declarada para silla de ruedas");
  assert(!browser("get", "text", "main").includes("wheelchair: 1"));
  inspect("reference-reload-light");
  browser("open", `${origin}/dashboard/tools/get_network_status`);
  browser("wait", "--text", "Consultar almacenado");
  click("Consultar almacenado");
  browser("wait", "--text", "Resultado de la consulta");
  inspect("stored-inspection-light");
  assert(
    snapshot().includes('button "Ejecutar herramienta" [disabled'),
    "Inspection never confirms manual execution",
  );
  browser("open", `${origin}/dashboard/conversations`);
  browser("wait", "--text", "Examinar conversación");
  click("Examinar conversación", "link");
  browser("wait", "--text", "Turno 2");
  click("Turno 2");
  browser("wait", "--text", "1200");
  inspect("selected-turn-light");
  browser("focus", ref(snapshot(), "Cronología", "tab"));
  browser("press", "ArrowRight");
  browser(
    "wait",
    "--fn",
    "document.querySelector('[role=tab][aria-selected=true]')?.textContent === 'Herramientas'",
  );
  inspect("trace-tools-light");
  browser("set", "viewport", "390", "844");
  click("Abrir navegación");
  browser("wait", "--fn", "document.querySelector('[role=dialog]') !== null");
  inspect("mobile-navigation-light");
  for (let i = 0; i < 12; i++) {
    browser("press", "Tab");
    assert(
      evaluate(
        "!!document.querySelector('[role=dialog]')?.contains(document.activeElement)",
      ),
      "Dialog traps Tab focus",
    );
  }
  browser("press", "Escape");
  browser(
    "wait",
    "--fn",
    "document.activeElement?.getAttribute('aria-label') === 'Abrir navegación'",
  );
  browser("open", `${origin}/dashboard/sources`);
  browser("wait", "--text", "Duración de operaciones comparables");
  browser(
    "focus",
    "section[aria-label='Latencias por componente y operación']",
  );
  browser("press", "ArrowRight");
  browser(
    "wait",
    "--fn",
    "document.querySelector('section[aria-label=\"Latencias por componente y operación\"]').scrollLeft > 0",
  );
  inspect("keyboard-table-light");
  click("Pausar actualización");
  browser("wait", "--text", "Actualización de pantalla: pausada");
  click("Actualizar pantalla");
  browser("wait", "--text", "La actualización está pausada");
  click("Reanudar");
  browser("set", "offline", "on");
  browser("wait", "--text", "Actualización de pantalla: suspendida");
  assert(
    snapshot().includes('heading "Fuentes y actualización"'),
    "Offline keeps the last rendered data",
  );
  browser("set", "offline", "off");
  browser("wait", "--text", "Actualización de pantalla: visible");
  browser("open", `${origin}/dashboard/conversations`);
  browser("wait", "--text", "Examinar conversación");
  const ownPath = evaluate(
    "document.querySelector('main a[href*=\"/dashboard/conversations/\"]').getAttribute('href')",
  );
  click("Salir");
  browser("wait", "--text", "Correo");
  browser(
    "fill",
    ref(snapshot(), "Correo", "textbox"),
    "dashboard-qa-2@example.invalid",
  );
  browser(
    "fill",
    ref(snapshot(), "Contraseña", "textbox"),
    "Synthetic-dashboard-password-2",
  );
  click("Entrar");
  browser("wait", "--text", "Panel");
  browser("open", `${origin}${ownPath}`);
  ready();
  const foreignStatus = evaluate(
    `fetch('/api/dashboard/conversations/${ownPath.split("/").at(-1)}/summary').then(r=>r.status)`,
  );
  assert.equal(
    foreignStatus,
    404,
    "Second identity cannot read the previous account's summary",
  );
  assert(
    !snapshot().includes('button "Turno 2"'),
    "Previous identity's trace is not cached across login",
  );
  save("functional.json", {
    entityMouseNavigation: true,
    routerStatePreserved: true,
    history: true,
    returnFilters: true,
    mapFailureFallback: true,
    mapCameraReturn: true,
    mapHitAreas: true,
    referenceKeyboardAndReload: true,
    storedInspectionOnly: true,
    selectedTurn1200ms: true,
    traceKeyboardTabs: true,
    mobileEscapeFocus: true,
    keyboardHorizontalScroll: true,
    pauseAndOfflineRecovery: true,
    sameBrowserIdentityIsolation: true,
  });
  console.log(
    `agent-browser: ${results.length} screens/forms passed; reports in ${output}`,
  );
} catch (error) {
  save("failure-url.txt", browser("get", "url"));
  save("failure-snapshot.txt", snapshot());
  save("failure-text.txt", browser("get", "text", "body"));
  throw error;
} finally {
  browser("close");
}
