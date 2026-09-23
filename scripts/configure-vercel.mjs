import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { SignJWT } from "jose";

if (!process.argv.includes("--apply"))
  throw new Error(
    "Use --apply to update production secrets. Does not deploy or purchase resources.",
  );
const root = parseEnv(readFileSync(".env.local", "utf8"));
const corePath = ".env.cloud.core.local";
const core = parseEnv(readFileSync(corePath, "utf8"));
if (!root.OPENAI_API_KEY || !core.DATABASE_URL_UNPOOLED)
  throw new Error(
    "Local OpenAI key and pulled cloud Core environment are required",
  );
for (const key of ["BETTER_AUTH_SECRET", "MOBILITY_JWT_SECRET"]) {
  if (core[key]?.includes("[SENSITIVE]"))
    throw new Error(
      `Restore the actual local ${key}; never upload a redacted placeholder`,
    );
}
if (core.KV_REST_API_URL && !core.KV_REST_API_TOKEN)
  throw new Error("Incomplete Upstash environment");
const origin = "https://mobility-twin-web.vercel.app";
const fields = {
  ...(core.KV_REST_API_URL
    ? {
        UPSTASH_REDIS_REST_URL: core.KV_REST_API_URL,
        UPSTASH_REDIS_REST_TOKEN: core.KV_REST_API_TOKEN,
      }
    : {}),
  BETTER_AUTH_SECRET:
    core.BETTER_AUTH_SECRET || randomBytes(32).toString("hex"),
  MOBILITY_JWT_SECRET:
    core.MOBILITY_JWT_SECRET || randomBytes(32).toString("hex"),
  MOBILITY_JWT_ISSUER: "mobility-evaluation",
  MOBILITY_JWT_AUDIENCE: "mobility-core",
  EVALUATION_ORIGIN: origin,
  INGESTION_ENABLED: "false",
  OTP_SANDBOX_ENABLED: "false",
};
const token = await new SignJWT({
  scope: "mobility.diagnostics.read mobility.evaluation.manage",
})
  .setProtectedHeader({ alg: "HS256" })
  .setSubject("eve-web-evaluation")
  .setIssuer(fields.MOBILITY_JWT_ISSUER)
  .setAudience(fields.MOBILITY_JWT_AUDIENCE)
  .setIssuedAt()
  .setExpirationTime("7d")
  .sign(new TextEncoder().encode(fields.MOBILITY_JWT_SECRET));
const web = {
  OPENAI_API_KEY: root.OPENAI_API_KEY,
  MOBILITY_MCP_URL: "https://mobility-twin-core.vercel.app/mcp",
  MOBILITY_MCP_TOKEN: token,
  EVALUATION_ORIGIN: origin,
};
function save(path, values) {
  writeFileSync(
    path,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n")}\n`,
    { mode: 0o600 },
  );
}
// Persist generated secrets before uploading: retries must not accidentally rotate them.
save(corePath, { ...core, ...fields });
save(".env.cloud.web.local", web);
for (const [project, values] of [
  ["mobility-core", fields],
  ["eve-web", web],
]) {
  for (const [key, value] of Object.entries(values)) {
    const secret = /SECRET|TOKEN|KEY/.test(key);
    const result = spawnSync(
      "pnpm",
      [
        "exec",
        "vercel",
        "env",
        "add",
        key,
        "production",
        "--force",
        "--yes",
        secret ? "--sensitive" : "--no-sensitive",
        "--cwd",
        `apps/${project}`,
        "--scope",
        "alansalazar",
      ],
      { input: value, encoding: "utf8", timeout: 60_000 },
    );
    // CLI output is intentionally suppressed to prevent credential echo on errors.
    if (result.status !== 0)
      throw new Error(
        `Failed to configure ${project}:${key}; review Vercel permissions`,
      );
    console.log(
      `Configured production ${project}:${key} (${secret ? "secret" : "config"})`,
    );
  }
}
console.log(
  "Production environments prepared without deploying. Refresh the 7-day service token before activation.",
);
