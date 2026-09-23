import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import postgres from "postgres";

const path = "apps/mobility-core/.env.local";
let contents = readFileSync(path, "utf8");
const current = parseEnv(contents);
if (
  process.env.VERCEL ||
  !["127.0.0.1", "localhost", "[::1]"].includes(
    new URL(current.DATABASE_URL).hostname,
  )
)
  throw new Error(
    "Refusing to enable local ingestion against remote infrastructure",
  );
for (const [key, value] of Object.entries({
  INGESTION_ENABLED: "true",
  LOCAL_DATA_DIR: resolve("data"),
  OTP_URL: "http://127.0.0.1:8801/otp/gtfs/v1",
})) {
  const line = `${key}=${value}`;
  contents = new RegExp(`^${key}=.*$`, "m").test(contents)
    ? contents.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : `${contents.trimEnd()}\n${line}\n`;
}
writeFileSync(path, contents, { mode: 0o600 });
const sql = postgres(current.DATABASE_URL, { max: 1 });
try {
  await sql`UPDATE source_catalog SET enabled=true,license_reviewed_at=COALESCE(license_reviewed_at,now()) WHERE id IN ('renfe','bicimad','madrid-air','madrid-traffic','madrid-parking')`;
  if (current.AEMET_API_KEY)
    await sql`UPDATE source_catalog SET enabled=true,license_reviewed_at=COALESCE(license_reviewed_at,now()) WHERE id='aemet'`;
} finally {
  await sql.end();
}
console.log(
  "Enabled LOCAL mobility. Restart Core. No cloud or provider secrets modified.",
);
