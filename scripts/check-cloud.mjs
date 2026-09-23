import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import postgres from "postgres";

// Explicit opt-in: this writes and removes one tiny probe in each store.
if (!process.argv.includes("--probe"))
  throw new Error(
    "Use --probe with the cloud environment loaded; never runs in CI",
  );
const require = createRequire(
  new URL("../apps/mobility-core/package.json", import.meta.url),
);
const { Redis } = require("@upstash/redis");
const { put, get, del } = require("@vercel/blob");
const sql = postgres(
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  { max: 1, connect_timeout: 10 },
);
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});
const key = `evaluation:probe:${randomUUID()}`;
let blob;
try {
  const [row] =
    await sql`SELECT PostGIS_Version() AS version, (SELECT count(*)::int FROM schema_migration) AS migrations`;
  assert.equal(row.migrations, 3);
  console.log(`Neon PostGIS ${row.version}: three migrations present`);
  await redis.set(key, "ready", { ex: 60 });
  assert.equal(await redis.get(key), "ready");
  await redis.del(key);
  console.log("Upstash REST: expiring write/read/delete verified");
  blob = await put(`probes/${randomUUID()}.txt`, "ready", {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: true,
  });
  const result = await get(blob.url, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  assert.ok(result?.stream);
  assert.equal(await new Response(result.stream).text(), "ready");
  console.log("Private Blob: authenticated write/read verified");
} catch {
  // SDK errors can contain connection strings. Keep credentials out of logs.
  throw new Error(
    "Cloud probe failed; inspect provider status without logging credentials",
  );
} finally {
  await sql.end();
  await redis.del(key);
  if (blob) await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN });
}
console.log(
  "Probe data removed; no deployment, source ingestion or routing started",
);
