import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
if (
  !["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(url).hostname) &&
  !process.argv.includes("--allow-remote")
) {
  throw new Error(
    "Remote migrations require explicit --allow-remote and an unpooled connection",
  );
}
const sql = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} });
try {
  await sql.begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(90123001)`;
    await transaction`CREATE TABLE IF NOT EXISTS schema_migration (
      name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`;
    const directory = new URL("../infra/postgres/migrations/", import.meta.url);
    for (const name of (await readdir(directory))
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      const content = await readFile(new URL(name, directory), "utf8");
      const hash = createHash("sha256").update(content).digest("hex");
      const [previous] =
        await transaction`SELECT sha256 FROM schema_migration WHERE name = ${name}`;
      if (previous) {
        if (previous.sha256 !== hash)
          throw new Error(`Applied migration changed: ${name}`);
        console.log(`Already applied: ${name}`);
        continue;
      }
      await transaction.unsafe(content);
      await transaction`INSERT INTO schema_migration(name, sha256) VALUES (${name}, ${hash})`;
      console.log(`Applied: ${name}`);
    }
  });
} finally {
  await sql.end();
}
