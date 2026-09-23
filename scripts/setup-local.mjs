import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { SignJWT } from "jose";

function create(path, content) {
  if (existsSync(path)) return false;
  writeFileSync(path, `${content.trim()}\n`, { flag: "wx", mode: 0o600 });
  console.log(`Created ${path} (values hidden)`);
  return true;
}

if (!existsSync(".env.local")) {
  const password = randomBytes(24).toString("hex");
  create(
    ".env.local",
    `
POSTGRES_USER=mobility
POSTGRES_DB=mobility
POSTGRES_PASSWORD=${password}
DATABASE_URL=postgresql://mobility:${password}@127.0.0.1:55432/mobility
REDIS_PASSWORD=${randomBytes(24).toString("hex")}
MOBILITY_JWT_SECRET=${randomBytes(32).toString("hex")}
`,
  );
}
const local = parseEnv(readFileSync(".env.local", "utf8"));
if (
  !local.MOBILITY_JWT_SECRET ||
  local.MOBILITY_JWT_SECRET.length < 32 ||
  !local.DATABASE_URL
) {
  throw new Error(
    "Local environment is incomplete; review .env.local without committing it",
  );
}
create(
  "apps/mobility-core/.env.local",
  `
DATABASE_URL=${local.DATABASE_URL}
DATABASE_URL_UNPOOLED=${local.DATABASE_URL}
MOBILITY_JWT_SECRET=${local.MOBILITY_JWT_SECRET}
MOBILITY_JWT_ISSUER=mobility-local
MOBILITY_JWT_AUDIENCE=mobility-core
INGESTION_ENABLED=false
OTP_SANDBOX_ENABLED=false
`,
);
const token = await new SignJWT({ scope: "mobility.diagnostics.read" })
  .setProtectedHeader({ alg: "HS256" })
  .setSubject("eve-web-local")
  .setIssuer("mobility-local")
  .setAudience("mobility-core")
  .setIssuedAt()
  .setExpirationTime("7d")
  .sign(new TextEncoder().encode(local.MOBILITY_JWT_SECRET));
const webPath = "apps/eve-web/.env.local";
create(
  webPath,
  `MOBILITY_MCP_URL=http://127.0.0.1:3001/mcp\nMOBILITY_MCP_TOKEN=${token}\nEVE_MODEL=\nAI_GATEWAY_API_KEY=\n`,
);
if (process.argv.includes("--refresh-token")) {
  const contents = readFileSync(webPath, "utf8");
  const web = parseEnv(contents);
  if (web.MOBILITY_MCP_URL !== "http://127.0.0.1:3001/mcp") {
    throw new Error(
      "Refusing to replace credentials for a non-local MCP connection",
    );
  }
  const core = parseEnv(readFileSync("apps/mobility-core/.env.local", "utf8"));
  if (core.MOBILITY_JWT_SECRET !== local.MOBILITY_JWT_SECRET) {
    throw new Error(
      "Local signing keys differ; reconcile configuration before refreshing the token",
    );
  }
  writeFileSync(
    webPath,
    contents.replace(/^MOBILITY_MCP_TOKEN=.*$/m, `MOBILITY_MCP_TOKEN=${token}`),
    { mode: 0o600 },
  );
  console.log("Refreshed the local MCP token (valid for 7 days; value hidden)");
}
console.log(
  "Local configuration ready. Existing files were preserved. No cloud resources or model calls were used.",
);
