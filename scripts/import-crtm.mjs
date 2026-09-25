import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import postgres from "postgres";

const tables = [
  "stops",
  "routes",
  "trips",
  "stop_times",
  "calendar",
  "exceptions",
  "frequencies",
];

// Streaming COPY keeps the interurban million-row export out of JS memory.
export async function importCrtm(sql, directory) {
  const manifest = JSON.parse(
    await readFile(resolve(directory, "manifest.json"), "utf8"),
  );
  const dataset = manifest.datasetId;
  if (
    !["metro", "light-rail", "interurban", "emt"].includes(dataset) ||
    manifest.parserVersion !== "crtm-gtfs-v1" ||
    manifest.timezone !== "Europe/Madrid" ||
    !/^[a-f0-9]{64}$/.test(manifest.version)
  )
    throw Error("Unsupported CRTM manifest");
  return sql.begin(async (tx) => {
    await tx`SET LOCAL lock_timeout = '10s'`;
    await tx`SET LOCAL statement_timeout = '5min'`;
    await tx`SELECT pg_advisory_xact_lock(90123014)`;
    const [previous] =
      await tx`SELECT version, manifest, enabled FROM crtm_feed WHERE dataset_id=${dataset}`;
    // Stage and hash the exact bytes consumed by COPY, including on a retry.
    for (const table of tables) {
      if (
        !Number.isSafeInteger(manifest.counts?.[table]) ||
        manifest.counts[table] < 0 ||
        manifest.counts[table] > 3000000
      )
        throw Error("Invalid CRTM row count");
      await tx.unsafe(
        `CREATE TEMP TABLE stage_${table} (LIKE crtm_${table} INCLUDING DEFAULTS) ON COMMIT DROP`,
      );
      const hash = createHash("sha256");
      const input = createReadStream(resolve(directory, `${table}.csv`));
      let bytes = 0;
      const writable = await tx
        .unsafe(`COPY stage_${table} FROM STDIN WITH (FORMAT csv, HEADER true)`)
        .writable();
      await pipeline(
        input,
        async function* (chunks) {
          for await (const chunk of chunks) {
            bytes += chunk.length;
            if (bytes > 600 * 1024 * 1024)
              throw Error("CRTM table exceeds size limit");
            hash.update(chunk);
            yield chunk;
          }
        },
        writable,
      );
      if (hash.digest("hex") !== manifest.tableHashes?.[table])
        throw Error(`CRTM checksum mismatch: ${table}`);
      const [count] = await tx.unsafe(
        `SELECT count(*)::integer AS total, count(*) FILTER (WHERE dataset_id <> $1 OR dataset_id IS NULL)::integer AS wrong FROM stage_${table}`,
        [dataset],
      );
      if (count.total !== manifest.counts[table] || count.wrong)
        throw Error(`CRTM row mismatch: ${table}`);
    }
    if (previous?.version === manifest.version && previous.enabled) {
      const comparable = ({ fetchedAt: _f, publishedAt: _p, ...rest }) => rest;
      if (
        !isDeepStrictEqual(comparable(previous.manifest), comparable(manifest))
      )
        throw Error("Conflicting CRTM version");
      return { dataset, version: manifest.version, changed: false };
    }
    await tx`INSERT INTO crtm_feed(dataset_id,version,fetched_at,published_at,service_start,service_end,manifest)
      VALUES(${dataset},${manifest.version},${manifest.fetchedAt},${manifest.publishedAt},${manifest.serviceStart},${manifest.serviceEnd},${tx.json(manifest)})
      ON CONFLICT(dataset_id) DO UPDATE SET version=excluded.version,fetched_at=excluded.fetched_at,
      published_at=excluded.published_at,service_start=excluded.service_start,service_end=excluded.service_end,
      manifest=excluded.manifest,imported_at=now(),enabled=true`;
    for (const table of [...tables].reverse())
      await tx.unsafe(`DELETE FROM crtm_${table} WHERE dataset_id=$1`, [
        dataset,
      ]);
    for (const table of tables)
      await tx.unsafe(`INSERT INTO crtm_${table} SELECT * FROM stage_${table}`);
    const [invalid] =
      await tx`SELECT count(*)::integer AS count FROM crtm_trips t WHERE t.dataset_id=${dataset}
      AND NOT EXISTS(SELECT 1 FROM crtm_calendar c WHERE c.dataset_id=t.dataset_id AND c.service_id=t.service_id)
      AND NOT EXISTS(SELECT 1 FROM crtm_exceptions e WHERE e.dataset_id=t.dataset_id AND e.service_id=t.service_id)`;
    if (invalid.count) throw Error("Missing CRTM service calendar");
    await tx`INSERT INTO crtm_stop_identity(dataset_id,external_id)
      SELECT dataset_id,external_id FROM crtm_stops WHERE dataset_id=${dataset} ON CONFLICT DO NOTHING`;
    return { dataset, version: manifest.version, changed: true };
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const url = process.env.DATABASE_URL;
  if (
    !url ||
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
  )
    throw Error("This import is local-only");
  if (!process.argv[2])
    throw Error(
      "Usage: node --env-file=.env.local scripts/import-crtm.mjs <prepared-version-directory>",
    );
  const sql = postgres(url, { max: 1 });
  try {
    console.log(
      JSON.stringify(await importCrtm(sql, resolve(process.argv[2]))),
    );
  } finally {
    await sql.end();
  }
}
