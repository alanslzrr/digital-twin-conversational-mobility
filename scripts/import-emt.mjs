import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import postgres from "postgres";
import { emtRequest } from "../apps/mobility-core/src/adapters/emt-client.ts";
import { parseEmtCatalog } from "../apps/mobility-core/src/adapters/emt-transit.ts";
import { storeEmtCatalog } from "../apps/mobility-core/src/catalogs/emt-store.ts";

const url = process.env.DATABASE_URL;
if (
  !url ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
)
  throw Error("This import is local-only");
const date = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Madrid",
}).format(new Date());
const rawStops = await emtRequest("/v1/transport/busemtmad/stops/list/", []);
const rawLines = await emtRequest(
  `/v2/transport/busemtmad/lines/info/${date.replaceAll("-", "")}/`,
);
const catalog = parseEmtCatalog(JSON.parse(rawStops), JSON.parse(rawLines));
const version = createHash("sha256")
  .update(JSON.stringify(catalog))
  .digest("hex");
const fetchedAt = new Date().toISOString();
const manifest = {
  source: "emt",
  version,
  fetchedAt,
  referenceDate: date,
  endpoints: [
    "/v1/transport/busemtmad/stops/list/",
    "/v2/transport/busemtmad/lines/info/{date}/",
  ],
  coverage:
    "EMT stops and line/direction memberships; not timetables or routing",
  attribution: "Powered by EMT de Madrid",
  terms: "https://mobilitylabs.emtmadrid.es/sip/terms-of-use",
  stops: catalog.stops.length,
  lines: catalog.lines.length,
};
const dir = new URL("../data/sources/emt/", import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(
  new URL(`${version}.json`, dir),
  JSON.stringify({ manifest, ...catalog }),
  { mode: 0o600 },
);
const sql = postgres(url, { max: 1 });
try {
  await storeEmtCatalog(sql, catalog, manifest);
  console.log(JSON.stringify(manifest));
} finally {
  await sql.end();
}
