import assert from "node:assert/strict";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const sql = postgres(url, { max: 1, connect_timeout: 10 });
try {
  const [extension] = await sql`SELECT PostGIS_Version() AS version`;
  const [sources] =
    await sql`SELECT count(*)::int AS count FROM source_catalog`;
  const [health] = await sql`SELECT count(*)::int AS count FROM source_health`;
  assert.equal(sources.count, 10);
  assert.equal(health.count, 10);
  const [distance] = await sql`SELECT ST_Distance(
    ST_SetSRID(ST_Point(-3.7038, 40.4168), 4326)::geography,
    ST_SetSRID(ST_Point(-3.7038, 40.4168), 4326)::geography
  ) AS meters`;
  assert.equal(Number(distance.meters), 0);
  console.log(
    `PostGIS ${extension.version}: spatial query and 10 initialized source records verified`,
  );
} finally {
  await sql.end();
}
