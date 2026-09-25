import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { importCrtm } from "./import-crtm.mjs";

const url = process.env.DATABASE_URL;
if (
  !url ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
)
  throw Error("Local database required");
const sql = postgres(url, { max: 1, onnotice: () => {} });
const schema = `crtm_test_${randomUUID().replaceAll("-", "")}`;
try {
  await sql.unsafe(`CREATE SCHEMA ${schema}`);
  await sql.unsafe(`SET search_path TO ${schema},public`);
  for (const file of [
    "0001_foundation.sql",
    "0004_local_mobility.sql",
    "0014_crtm_static.sql",
    "0016_routing_releases.sql",
  ])
    await sql.unsafe(
      await readFile(
        new URL(`../infra/postgres/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  for (const dataset of ["metro", "light-rail", "interurban", "emt"]) {
    const root = new URL(`../data/sources/crtm/${dataset}/`, import.meta.url);
    const versions = (await readdir(root)).filter((x) =>
      /^[a-f0-9]{64}$/.test(x),
    );
    assert.equal(
      versions.length,
      1,
      "Choose a single prepared fixture version",
    );
    const dir = new URL(`${versions[0]}/`, root).pathname;
    assert.equal((await importCrtm(sql, dir)).changed, true);
    const [before] =
      await sql`SELECT id FROM crtm_stop_identity WHERE dataset_id=${dataset} ORDER BY external_id LIMIT 1`;
    assert.equal((await importCrtm(sql, dir)).changed, false);
    const [after] =
      await sql`SELECT id FROM crtm_stop_identity WHERE dataset_id=${dataset} ORDER BY external_id LIMIT 1`;
    assert.equal(before.id, after.id);
    if (dataset === "metro") {
      const scratch = await mkdtemp(join(tmpdir(), "crtm-import-"));
      try {
        await cp(dir, scratch, { recursive: true });
        const path = join(scratch, "manifest.json");
        const manifest = JSON.parse(await readFile(path, "utf8"));
        manifest.version = "a".repeat(64);
        await writeFile(path, JSON.stringify(manifest));
        assert.equal((await importCrtm(sql, scratch)).changed, true);
        const [replaced] =
          await sql`SELECT id FROM crtm_stop_identity WHERE dataset_id=${dataset} ORDER BY external_id LIMIT 1`;
        assert.equal(replaced.id, before.id);
        manifest.version = "b".repeat(64);
        manifest.tableHashes.stops = "0".repeat(64);
        await writeFile(path, JSON.stringify(manifest));
        await assert.rejects(importCrtm(sql, scratch), /checksum mismatch/);
        const [unchanged] =
          await sql`SELECT version FROM crtm_feed WHERE dataset_id=${dataset}`;
        assert.equal(unchanged.version, "a".repeat(64));
      } finally {
        await rm(scratch, { recursive: true, force: true });
      }
    }
    const [count] =
      await sql`SELECT count(*)::integer AS count FROM crtm_stop_times WHERE dataset_id=${dataset}`;
    console.log(
      `${dataset}: imported and retried ${count.count} stop times; stable identity`,
    );
  }
  const [expired] =
    await sql`SELECT service_end < DATE '2026-09-25' AS expired FROM crtm_feed WHERE dataset_id='metro'`;
  assert.equal(expired.expired, true);
} finally {
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await sql.end();
}
