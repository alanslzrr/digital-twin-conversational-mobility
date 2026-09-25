import { spawn } from "node:child_process";
import { copyFile, lstat, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

if (process.env.VERCEL) throw new Error("OTP graph builds are local-only");
if ((await lstat("data/otp")).isSymbolicLink())
  throw new Error(
    "Use immutable routing release preparation/build; active release cannot be overwritten",
  );
const start = performance.now();
const manifest = JSON.parse(await readFile("data/otp/manifest.json", "utf8"));
const result = await new Promise((resolve, reject) => {
  const child = spawn(
    "docker",
    [
      "compose",
      "--env-file",
      ".env.local",
      "-f",
      "infra/local/compose.yaml",
      "run",
      "--rm",
      "otp",
      "--build",
      "--save",
    ],
    { stdio: "inherit" },
  );
  child.on("error", reject);
  child.on("exit", resolve);
});
if (result !== 0)
  throw new Error(
    "OTP graph build failed; do not use the previous graph with new static data",
  );
await copyFile("data/otp/manifest.json", "data/otp/graph-manifest.json");
await writeFile(
  "data/otp/build-report.json",
  JSON.stringify(
    {
      durationSeconds: (performance.now() - start) / 1000,
      staticVersion: manifest.staticVersion,
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(
  "Graph built and version manifest recorded. Restart OTP after importing this GTFS.",
);
