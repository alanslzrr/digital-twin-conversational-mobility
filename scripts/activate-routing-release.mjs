import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import postgres from "postgres";
import { importCrtm } from "./import-crtm.mjs";
import { importRenfe } from "./import-renfe.mjs";
import { fileHash, verifyRelease } from "./routing-release-files.mjs";

const root = process.cwd(),
  home = resolve(root, "data/routing-releases"),
  active = resolve(root, "data/otp");
const journal = resolve(root, "data/runtime/routing-transition.json"),
  lock = resolve(root, "data/runtime/routing-transition.lock");
const mode = process.argv[2],
  requested = process.argv[3];
if (
  process.env.VERCEL ||
  !process.argv.includes("--maintenance") ||
  !["activate", "rollback", "recover"].includes(mode)
)
  throw Error(
    "Usage: activate-routing-release.mjs activate <id>|rollback|recover --maintenance (stop Core/Web/worker first)",
  );
const url = process.env.DATABASE_URL;
if (
  !url ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
)
  throw Error("Local database required");
for (const port of [3000, 3001, 4274]) {
  try {
    await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(500),
    });
  } catch {
    continue;
  }
  throw Error("Stop habitual Core, Web and agent before maintenance");
}
await mkdir(home, { recursive: true });
await mkdir(resolve(root, "data/runtime"), { recursive: true });
// Recovery after process death is explicit; never steal a live activation lock.
if (mode === "recover") {
  try {
    const owner = Number(await readFile(lock, "utf8"));
    try {
      process.kill(owner, 0);
      throw Error("Activation process is still alive");
    } catch (e) {
      if (e.code !== "ESRCH") throw e;
    }
    await rm(lock);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
const held = await open(lock, "wx", 0o600);
await held.writeFile(String(process.pid));
const sql = postgres(url, { max: 1, onnotice: () => {} });
const directory = (id) => {
  if (!/^[a-f0-9]{64}$/.test(id ?? "")) throw Error("Invalid release id");
  return resolve(home, id);
};
async function atomicJson(path, value) {
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2), {
    mode: 0o600,
  });
  await rename(`${path}.tmp`, path);
}
async function compose(...args) {
  const code = await new Promise((ok, fail) => {
    const p = spawn(
      "docker",
      [
        "compose",
        "--env-file",
        ".env.local",
        "-f",
        "infra/local/compose.yaml",
        ...args,
      ],
      { stdio: "inherit" },
    );
    p.on("error", fail);
    p.on("exit", ok);
  });
  if (code !== 0) throw Error("OTP container operation failed");
}
async function pointAt(id) {
  const temp = `${active}.next`;
  await rm(temp, { force: true });
  await symlink(directory(id), temp, "dir");
  try {
    if (!(await lstat(active)).isSymbolicLink()) {
      // Journal already records the recoverable baseline before the first rename.
      await readFile(journal);
      await rename(
        active,
        resolve(root, `data/otp-before-releases-${Date.now()}`),
      );
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await rename(temp, active);
}
async function baseline() {
  if ((await lstat(active)).isSymbolicLink())
    return (await verifyRelease(await realpath(active))).releaseId;
  const old = JSON.parse(
    await readFile(resolve(active, "graph-manifest.json"), "utf8"),
  );
  const [renfe] =
    await sql`SELECT version,service_start::text,service_end::text FROM static_feed WHERE source_id='renfe'`;
  if (!renfe || old.staticVersion !== renfe.version)
    throw Error(
      "Legacy graph/catalog mismatch; cannot capture rollback baseline",
    );
  const exported = resolve(root, "data/sources/renfe-madrid.json");
  if (
    JSON.parse(await readFile(exported, "utf8")).manifest.staticVersion !==
    renfe.version
  )
    throw Error("Legacy Renfe export mismatch");
  const catalogs =
    await sql`SELECT dataset_id,version FROM crtm_feed WHERE enabled ORDER BY dataset_id`;
  const graphSha256 = await fileHash(resolve(active, "graph.obj"));
  const id = createHash("sha256")
    .update(JSON.stringify(["legacy", graphSha256, catalogs]))
    .digest("hex");
  const dir = directory(id);
  await mkdir(dir, { recursive: true });
  for (const file of [
    "graph.obj",
    "madrid.osm.pbf",
    "renfe-madrid.gtfs.zip",
    "build-config.json",
    "router-config.json",
    "otp-config.json",
  ])
    await cp(resolve(active, file), resolve(dir, file));
  await cp(exported, resolve(dir, "renfe-madrid.json"));
  const versions = {};
  for (const row of catalogs) {
    versions[row.dataset_id] = row.version;
    await cp(
      resolve(root, "data/sources/crtm", row.dataset_id, row.version),
      resolve(dir, "catalogs", row.dataset_id),
      { recursive: true },
    );
  }
  const files = {};
  for (const file of [
    "madrid.osm.pbf",
    "renfe-madrid.gtfs.zip",
    "renfe-madrid.json",
    "build-config.json",
    "router-config.json",
    "otp-config.json",
  ])
    files[file] = await fileHash(resolve(dir, file));
  for (const row of catalogs) {
    const m = JSON.parse(
      await readFile(
        resolve(dir, "catalogs", row.dataset_id, "manifest.json"),
        "utf8",
      ),
    );
    files[`catalogs/${row.dataset_id}/manifest.json`] = await fileHash(
      resolve(dir, "catalogs", row.dataset_id, "manifest.json"),
    );
    for (const [table, hash] of Object.entries(m.tableHashes))
      files[`catalogs/${row.dataset_id}/${table}.csv`] = hash;
  }
  const manifest = {
    format: "routing-release-v1",
    releaseId: id,
    staticVersion: renfe.version,
    renfeCatalog: renfe.version,
    catalogs: versions,
    feeds: {
      renfe: {
        version: renfe.version,
        serviceStart: renfe.service_start,
        serviceEnd: renfe.service_end,
        source: "renfe-madrid.gtfs.zip",
      },
    },
    files,
    graphSha256,
    coverage: "Legacy Renfe-only graph; Madrid OSM streets",
    otpVerifiedAt: new Date().toISOString(),
  };
  await atomicJson(resolve(dir, "manifest.json"), manifest);
  await atomicJson(resolve(dir, "graph-manifest.json"), manifest);
  await verifyRelease(dir);
  await sql`INSERT INTO routing_release(id,manifest,state,activated_at) VALUES(${id},${sql.json(manifest)},'active',now()) ON CONFLICT(id) DO NOTHING`;
  await atomicJson(journal, {
    previous: id,
    next: id,
    phase: "baseline",
    startedAt: new Date().toISOString(),
  });
  await pointAt(id);
  await rm(journal);
  return id;
}
async function apply(id) {
  const dir = directory(id),
    m = await verifyRelease(dir);
  await compose("stop", "otp");
  await importRenfe(sql, resolve(dir, "renfe-madrid.json"));
  for (const network of Object.keys(m.catalogs))
    await importCrtm(sql, resolve(dir, "catalogs", network));
  await sql.begin(async (tx) => {
    const absent =
      await tx`SELECT dataset_id FROM crtm_feed WHERE NOT(dataset_id=ANY(${Object.keys(m.catalogs)}::text[]))`;
    for (const { dataset_id: network } of absent) {
      for (const table of [
        "frequencies",
        "exceptions",
        "calendar",
        "stop_times",
        "trips",
        "routes",
        "stops",
      ])
        await tx.unsafe(`DELETE FROM crtm_${table} WHERE dataset_id=$1`, [
          network,
        ]);
      await tx`UPDATE crtm_feed SET enabled=false WHERE dataset_id=${network}`;
    }
    await tx`DELETE FROM routing_place_link`;
    if (m.feeds.emt)
      await tx`INSERT INTO routing_place_link(place_id,feed_id,stop_id,static_version,evidence,distance_meters)
      SELECT p.id,'emt',min(s.external_id),${m.feeds.emt.version},'published_EMT_stop_id_and_coordinates',min(ST_Distance(p.location,ST_SetSRID(ST_MakePoint(s.longitude,s.latitude),4326)::geography))
      FROM canonical_place p JOIN place_external_identifier i ON i.place_id=p.id AND i.source_id='emt' AND i.namespace='api.stop'
      JOIN emt_catalog ec ON ec.version=i.source_version JOIN crtm_stops s ON s.dataset_id='emt' AND s.external_id=i.external_id
      WHERE ST_DWithin(p.location,ST_SetSRID(ST_MakePoint(s.longitude,s.latitude),4326)::geography,100) GROUP BY p.id HAVING count(*)=1`;
    await tx`UPDATE routing_release SET state='retired' WHERE state='active'`;
    await tx`INSERT INTO routing_release(id,manifest,state,activated_at) VALUES(${id},${tx.json(m)},'active',now()) ON CONFLICT(id) DO UPDATE SET manifest=excluded.manifest,state='active',activated_at=now()`;
  });
  await pointAt(id);
  await compose("--profile", "routing", "up", "-d", "--force-recreate", "otp");
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const response = await fetch("http://127.0.0.1:8801/otp/gtfs/v1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{feeds{feedId}}" }),
        signal: AbortSignal.timeout(2000),
      });
      const data = await response.json();
      const feeds = data.data?.feeds?.map((x) => x.feedId).sort();
      if (
        JSON.stringify(feeds) === JSON.stringify(Object.keys(m.feeds).sort())
      ) {
        ready = true;
        break;
      }
    } catch {}
    await delay(2000);
  }
  if (!ready) throw Error("OTP did not load the expected feed set");
  await sql`UPDATE routing_release SET manifest=manifest||${sql.json({ otpVerifiedAt: new Date().toISOString() })} WHERE id=${id}`;
  return m;
}
try {
  if (mode === "recover") {
    const pending = JSON.parse(await readFile(journal, "utf8"));
    await apply(pending.previous);
    await rm(journal);
    console.log(JSON.stringify({ recovered: pending.previous }));
  } else {
    try {
      await readFile(journal);
      throw Error("Unfinished routing transition; use recover first");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const previous = await baseline();
    const target =
      mode === "rollback"
        ? JSON.parse(
            await readFile(
              resolve(root, "data/runtime/routing-previous.json"),
              "utf8",
            ),
          ).id
        : requested;
    await verifyRelease(directory(target));
    if (target === previous) {
      console.log(JSON.stringify({ release: target, changed: false }));
    } else {
      await atomicJson(journal, {
        previous,
        next: target,
        startedAt: new Date().toISOString(),
      });
      try {
        await apply(target);
        await atomicJson(resolve(root, "data/runtime/routing-previous.json"), {
          id: previous,
        });
        await rm(journal);
        console.log(
          JSON.stringify({ release: target, previous, changed: true }),
        );
      } catch {
        try {
          await apply(previous);
          await rm(journal);
        } catch {
          throw Error(
            "Activation and rollback failed; keep applications stopped and run recover. Journal retained.",
          );
        }
        throw Error(
          "Activation failed; previous routing release restored. Applications remain stopped.",
        );
      }
    }
  }
} finally {
  await sql.end();
  await held.close();
  await rm(lock, { force: true });
}
