import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// Infrastructure is explicit (infra:up / otp:up). Only own our application children.
for (const port of [3000, 3001, 4274]) {
  try {
    await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(500),
    });
  } catch {
    continue;
  }
  throw new Error(
    `Port ${port} already has a service. Stop the existing project process before start:local.`,
  );
}
const children = new Set();
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop(0));
const root = process.cwd();
const core = resolve(root, "apps/mobility-core");
const next = createRequire(resolve(core, "package.json")).resolve(
  "next/dist/bin/next",
);
const processes = [
  {
    cwd: core,
    args: [next, "start", "--hostname", "127.0.0.1", "--port", "3001"],
  },
  {
    cwd: resolve(root, "apps/eve-web"),
    args: [
      "--env-file-if-exists=.env.local",
      resolve(root, "scripts/start-web.mjs"),
    ],
  },
];
// Smoke tests own their explicit ticks; avoid a second worker during those checks.
if (!process.argv.includes("--no-worker"))
  processes.push({
    cwd: root,
    args: ["--env-file-if-exists=.env.local", "scripts/ingestion-worker.mjs"],
  });
for (const config of processes) {
  const child = spawn(process.execPath, config.args, {
    cwd: config.cwd,
    stdio: "inherit",
    env: process.env,
  });
  children.add(child);
  child.once("error", () => stop(1));
  child.once("exit", (code) => {
    children.delete(child);
    stop(code ?? 1);
  });
}
