import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

let failed = false;
function check(label, ok, detail) {
  console.log(
    `${ok ? "OK" : "MISSING"} ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failed = true;
}
function succeeds(command, args) {
  return spawnSync(command, args, { stdio: "ignore" }).status === 0;
}
check("Node 24", process.versions.node.split(".")[0] === "24", process.version);
check("pnpm", succeeds("pnpm", ["--version"]));
check("dependencies", existsSync("node_modules/.pnpm"));
check("Docker engine", succeeds("docker", ["info"]));
for (const file of [
  ".env.local",
  "apps/eve-web/.env.local",
  "apps/mobility-core/.env.local",
]) {
  check(file, existsSync(file), "contents never printed");
}
console.log("Cloud login (optional for local development):");
console.log(
  `  GitHub: ${succeeds("gh", ["auth", "status"]) ? "authenticated" : "not configured"}`,
);
console.log(
  `  Vercel: ${succeeds("vercel", ["whoami"]) ? "authenticated" : "not configured"}`,
);
process.exitCode = failed ? 1 : 0;
