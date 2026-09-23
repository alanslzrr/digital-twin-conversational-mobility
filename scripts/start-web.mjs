import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Next serves saved build-time rewrites in `next start`; with the pinned versions
// it does not invoke the EVE process-start callback. Supervise both explicitly.
const root = process.cwd();
const require = createRequire(resolve(root, "package.json"));
const entry = resolve(root, ".output/server/index.mjs");
if (!existsSync(entry))
  throw new Error(
    "Run pnpm build:agent before starting the production build locally",
  );
const port = process.env.EVE_NEXT_PRODUCTION_PORT || "4274";
const children = new Set();
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
}
function launch(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  children.add(child);
  child.once("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.once("exit", (code) => {
    children.delete(child);
    stop(code ?? 1);
  });
  return child;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop(0));
const env = { ...process.env, NODE_ENV: "production" };
// A development flag must never accidentally open the production-mode server.
delete env.EVE_DEV;
delete env.VERCEL;
delete env.VERCEL_ENV;
launch([entry], {
  ...env,
  HOST: "127.0.0.1",
  NITRO_HOST: "127.0.0.1",
  PORT: port,
  NITRO_PORT: port,
});
let ready = false;
for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
  try {
    ready = (
      await fetch(`http://127.0.0.1:${port}/eve/v1/health`, {
        signal: AbortSignal.timeout(1_000),
      })
    ).ok;
    if (ready) break;
  } catch {
    /* Wait for the local runtime socket; no external network is used. */
  }
  await delay(500);
}
if (!ready) {
  console.error("Local EVE runtime did not become ready");
  stop(1);
} else if (!stopping) {
  launch(
    [
      require.resolve("next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3000",
    ],
    env,
  );
}
