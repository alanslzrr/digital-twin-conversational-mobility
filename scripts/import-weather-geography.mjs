import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (
  !url ||
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)
)
  throw Error("Local PostgreSQL required");
// Explicit official IGN extract, not downloaded during routing. Re-run to replace atomically.
const path = process.argv[2];
if (!path)
  throw Error(
    "Usage: node --env-file=.env.local scripts/import-weather-geography.mjs <official IGN ES30 GeoJSON>",
  );
const raw = await readFile(path);
if (raw.length > 32_000_000) throw Error("Extract exceeds bound");
const sourceVersion = `IGN-AU:sha256:${createHash("sha256").update(raw).digest("hex")}`;
const data = JSON.parse(raw);
assert.equal(data.type, "FeatureCollection");
const records = data.features.filter((f) =>
  /^28\d{3}$/.test(f.properties.nationalcode.slice(-5)),
);
assert.equal(records.length, 179);
assert.equal(new Set(records.map((f) => f.properties.nationalcode)).size, 179);
const sql = postgres(url, { max: 1 });
try {
  await sql.begin(async (tx) => {
    for (const f of records) {
      assert.equal(f.properties.codnut2, "ES30");
      assert.equal(f.properties.nationallevelname, "Municipio");
      assert.equal(f.properties.country, "ES");
      assert.ok(["Polygon", "MultiPolygon"].includes(f.geometry.type));
      await tx`INSERT INTO weather_municipality(code,name,boundary,source_version) VALUES(${f.properties.nationalcode.slice(-5)},${f.properties.nameunit},ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(f.geometry)}),4326)),${sourceVersion}) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,boundary=EXCLUDED.boundary,source_version=EXCLUDED.source_version,imported_at=now()`;
    }
    const [invalid] =
      await tx`SELECT count(*)::int AS n FROM weather_municipality WHERE NOT ST_IsValid(boundary) OR ST_IsEmpty(boundary) OR NOT ST_CoveredBy(boundary,ST_MakeEnvelope(-5,39,-2,42,4326))`;
    assert.equal(invalid.n, 0);
    await tx`DELETE FROM weather_municipality WHERE source_version<>${sourceVersion}`;
  });
  console.log(
    JSON.stringify({
      municipalities: records.length,
      excludedSpecialTerritories: data.features.length - records.length,
      sourceVersion,
      source:
        "https://api-features.ign.es/collections/administrativeunit/items?f=json&limit=200&codnut2=ES30&nationallevelname=Municipio",
    }),
  );
} finally {
  await sql.end();
}
