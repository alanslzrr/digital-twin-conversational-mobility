import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import postgres from "postgres";
import { backfillRenfeAccessibility } from "./renfe-accessibility.mjs";

const url = process.env.DATABASE_URL;
assert.ok(
  url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  "Local PostgreSQL required",
);
try {
  await access("data/runtime/routing-transition.json");
  throw Error("Routing transition active");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const manifest = JSON.parse(await readFile("data/otp/manifest.json", "utf8"));
const raw = await readFile("data/otp/renfe-madrid.json");
assert.equal(
  createHash("sha256").update(raw).digest("hex"),
  manifest.files["renfe-madrid.json"],
);
const zip = await readFile("data/otp/renfe-madrid.gtfs.zip");
assert.equal(
  createHash("sha256").update(zip).digest("hex"),
  manifest.feeds.renfe.version,
);
const data = JSON.parse(raw);
assert.equal(data.manifest.staticVersion, manifest.feeds.renfe.version);
const sql = postgres(url, { max: 1 });
try {
  await backfillRenfeAccessibility(sql, data, manifest.releaseId);
  console.log(
    JSON.stringify({
      releaseId: manifest.releaseId,
      version: data.manifest.staticVersion,
      stops: data.stops.length,
      trips: data.trips.length,
    }),
  );
} finally {
  await sql.end();
}
