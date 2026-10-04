/** Opt-in browser audit. Run test-dashboard-local.mjs --preview first.
 * AGENT_BROWSER_BIN must point to the agent-browser 0.38.2 CLI executable.
 * Uses real Better Auth with disposable accounts; mutates only their disposable
 * QA schema for disabled-source and cached-arrival states. Never the usual installation.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const cli = process.env.AGENT_BROWSER_BIN;
assert(cli, "Set AGENT_BROWSER_BIN to an installed agent-browser executable");
const output = resolve(
  process.env.DASHBOARD_AUDIT_OUTPUT ?? "tmp/dashboard-independent-fixes",
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
      ...(name === "R1-dgt-list-map" ? ["--full"] : []),
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

import postgres from "postgres";

const schema = readFileSync("tmp/dashboard-qa/schema.txt", "utf8").trim();
assert(
  /^dashboard_qa_[a-f0-9]+$/.test(schema),
  "Disposable QA schema required",
);
const databaseUrl = process.env.DATABASE_URL;
assert(
  databaseUrl &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl).hostname),
  "Local DB required",
);
const sql = postgres(databaseUrl, {
  max: 1,
  connection: { search_path: `${schema},public` },
  onnotice: () => {},
});
const api = (path) =>
  evaluate(
    `fetch(${JSON.stringify(`/api/dashboard/${path}`)}).then(async r => {if(!r.ok) throw Error('HTTP '+r.status);return r.json()})`,
  );
function open(path) {
  browser("open", `${origin}${path}`);
  ready();
}
function dateFields() {
  return evaluate(
    "({from:document.querySelector('#event-from').value,to:document.querySelector('#event-to').value})",
  );
}
function hours(range) {
  return (Date.parse(`${range.to}Z`) - Date.parse(`${range.from}Z`)) / 3600000;
}
try {
  assert.equal(browser("--version"), "agent-browser 0.38.2");
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
  browser("set", "media", "light", "reduced-motion");
  browser("set", "viewport", "1440", "900");
  // Fresh, targeted inspection of every section, not the archived matrix.
  for (const section of [
    "",
    "mobility",
    "tools",
    "sources",
    "activity",
    "conversations",
  ]) {
    open(`/dashboard${section ? `/${section}` : ""}`);
    inspect(`section-${section || "overview"}`);
  }
  // R1: actual adapter shape, rendered list, map request and marker.
  open(
    "/dashboard/mobility?section=dynamic&category=incidents&product=dgt-incidents&search=QA",
  );
  browser("wait", "--text", "QA sintética · incidencia DGT");
  const list = api(
    "entities?category=incidents&product=dgt-incidents&search=QA",
  );
  assert.equal(list.entities.length, 1);
  click("Mostrar mapa");
  browser(
    "wait",
    "--fn",
    "(() => {const c=document.querySelector('.leaflet-overlay-pane canvas');return !!c && c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3 && v>0);})()",
  );
  const map = api(
    "map?category=incidents&product=dgt-incidents&search=QA&bbox=-4,40,-3,41",
  );
  assert.equal(map.entities.length, 1);
  assert.equal(map.entities[0].id, list.entities[0].id);
  assert.equal(map.totals.total, 1);
  inspect("R1-dgt-list-map");
  // R3: selector changes the request, value and navigation all the way back.
  open("/dashboard");
  browser(
    "wait",
    "--fn",
    "!!document.querySelector('#overview-parking-category')",
  );
  browser("select", ref(snapshot(), "Categoría de plazas", "combobox"), "b");
  browser(
    "wait",
    "--fn",
    `!!document.querySelector('article a[href*="parkingCategory=b"]')`,
  );
  const parkingArticle = evaluate(
    "Array.from(document.querySelectorAll('article')).find(a=>a.innerText.includes('Plazas libres publicadas')).innerText",
  );
  assert(parkingArticle.includes("Categoría publicada B"));
  assert.match(parkingArticle, /\n2\n/);
  inspect("R3-category-selected");
  const parkingHref = evaluate(
    `document.querySelector('article a[href*="parkingCategory=b"]').getAttribute('href')`,
  );
  open(parkingHref);
  browser("wait", "--text", "QA sintética · aparcamiento");
  const parkingRows = api("entities?category=parking&parkingCategory=b");
  assert.equal(parkingRows.totals.total, 1);
  assert.equal(parkingRows.entities[0].id, "qa-parking:b");
  const detailHref = evaluate(
    "Array.from(document.querySelectorAll('main a')).find(a=>a.getAttribute('href')?.includes('/dashboard/mobility/parking/qa-parking')).getAttribute('href')",
  );
  assert(detailHref.includes("parkingCategory=b"));
  open(detailHref);
  browser("wait", "--text", "Volver al explorador");
  click("Volver al explorador", "link");
  browser("wait", "--fn", "location.search.includes('parkingCategory=b')");
  inspect("R3-category-return");
  // R4: dates equal effective Core range; editing only from keeps the displayed to.
  open("/dashboard/activity");
  browser(
    "wait",
    "--fn",
    "!!document.querySelector('#event-from') && !document.querySelector('#event-from').disabled",
  );
  assert.equal(hours(dateFields()), 24);
  inspect("R4-default-24h");
  browser("select", ref(snapshot(), "Periodo", "combobox"), "1h");
  browser(
    "wait",
    "--fn",
    "!document.querySelector('#event-from').disabled && (Date.parse(document.querySelector('#event-to').value)-Date.parse(document.querySelector('#event-from').value))===3600000",
  );
  const before = dateFields();
  assert.equal(hours(before), 1);
  inspect("R4-relative-1h");
  // Native datetime inputs expose spinbuttons, not a textbox. Exercise a real key.
  browser("focus", ref(snapshot(), "Minutes Minutes", "spinbutton"));
  browser("press", "ArrowUp");
  browser("press", "Tab");
  browser(
    "wait",
    "--fn",
    "location.search.includes('from=') && document.querySelector('#event-period').value==='custom'",
  );
  const after = dateFields();
  assert.equal(after.to, before.to);
  assert.notEqual(after.from, before.from);
  const query = evaluate(
    "Object.fromEntries(new URLSearchParams(location.search))",
  );
  assert.equal(new Date(query.to).toISOString().slice(0, 16), before.to);
  inspect("R4-custom-one-endpoint");
  // R5: never queried, pending reservation, queried empty, old observation.
  await sql`DELETE FROM emt_arrival_cache`;
  open("/dashboard");
  browser("wait", "--text", "Sin consulta previa");
  let product = api("overview").products.find((p) => p.id === "emt:arrivals");
  assert.equal(product.observedAt, null);
  assert.equal(product.usable, false);
  inspect("R5-no-query");
  await sql`INSERT INTO emt_arrival_cache(stop_id) VALUES('qa-pending')`;
  open("/dashboard");
  browser("wait", "--text", "Sin consulta previa");
  product = api("overview").products.find((p) => p.id === "emt:arrivals");
  assert.equal(product.total, 0);
  await sql`UPDATE emt_arrival_cache SET observed_at=now(),ingested_at=now(),payload='[]'::jsonb WHERE stop_id='qa-pending'`;
  open("/dashboard");
  product = api("overview").products.find((p) => p.id === "emt:arrivals");
  assert.equal(product.usable, true);
  assert.equal(product.issue, null);
  inspect("R5-empty-recent-query");
  await sql`UPDATE emt_arrival_cache SET observed_at=now()-interval '5 minutes' WHERE stop_id='qa-pending'`;
  open("/dashboard");
  product = api("overview").products.find((p) => p.id === "emt:arrivals");
  assert.equal(product.usable, false);
  assert(product.issue.includes("La última lectura"));
  inspect("R5-old-query");
  // R2: install a new explicitly synthetic observation for this test case.
  // Never rewrite timestamps of retained public data or acquire from a source.
  const observedAt = new Date().toISOString();
  await sql`INSERT INTO mobility_snapshot(job_id,source_id,observed_at,ingested_at,quality,raw_reference,payload) VALUES('dgt-incidents','dgt',${observedAt},${observedAt},'provisional','synthetic-independent-r2',${sql.json({ incidents: [{ id: "qa-disabled-notice", title: "QA sintética · lectura reciente de fuente deshabilitada" }] })}) ON CONFLICT(job_id) DO UPDATE SET observed_at=EXCLUDED.observed_at,ingested_at=EXCLUDED.ingested_at,payload=EXCLUDED.payload,raw_reference=EXCLUDED.raw_reference`;
  // Recent retained DGT is not availability when its source is disabled.
  await sql`UPDATE source_catalog SET enabled=false WHERE id IN ('dgt','emt','renfe','aemet')`;
  open("/dashboard");
  const disabled = api("overview");
  assert(
    disabled.products.find((p) => p.id === "dgt-incidents").usable,
    "R2 requires retained usable DGT evidence",
  );
  assert.equal(disabled.metrics.find((m) => m.id === "M3").value, null);
  const noticeText = evaluate(
    "Array.from(document.querySelectorAll('article')).find(a=>a.innerText.includes('Avisos vigentes publicados')).innerText",
  );
  assert(noticeText.includes("Sin dato"));
  inspect("R2-disabled-unavailable");
  for (const theme of ["light", "dark"]) {
    browser("set", "media", theme, "reduced-motion");
    browser("set", "viewport", "390", "844");
    for (const section of ["", "activity"]) {
      open(`/dashboard${section ? `/${section}` : ""}`);
      inspect(`responsive-${section || "overview"}-390-${theme}`);
    }
  }
  save("functional.json", {
    R1: true,
    R2: true,
    R3: true,
    R4: true,
    R5: true,
    sections: 6,
    newInspections: results.length,
  });
  console.log(
    JSON.stringify({ passed: true, inspections: results.length, output }),
  );
} catch (error) {
  save("failure.txt", String(error));
  try {
    save("failure-snapshot.txt", snapshot());
    save("failure-body.txt", browser("get", "text", "body"));
  } catch {}
  throw error;
} finally {
  try {
    browser("close");
  } finally {
    await sql.end();
  }
}
