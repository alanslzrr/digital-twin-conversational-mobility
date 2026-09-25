import { spawn } from "node:child_process";
import { access, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileHash, verifyRelease } from "./routing-release-files.mjs";

const id = process.argv[2];
if (process.env.VERCEL || !/^[a-f0-9]{64}$/.test(id ?? ""))
  throw Error("Usage: build-routing-release.mjs <release-id>; local only");
const dir = resolve("data/routing-releases", id);
try {
  await access(resolve(dir, "graph-manifest.json"));
  await verifyRelease(dir);
  console.log(JSON.stringify({ release: id, built: true, reused: true }));
  process.exit(0); // Completed releases are immutable, including the active one.
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const manifest = await verifyRelease(dir, false);
if (
  manifest.releaseId !== id ||
  !/^opentripplanner\/opentripplanner:2\.10\.0@sha256:[a-f0-9]{64}$/.test(
    manifest.otpImage,
  )
)
  throw Error("Invalid release/image");
const code = await new Promise((ok, fail) => {
  const child = spawn(
    "docker",
    [
      "run",
      "--rm",
      "--pull=never",
      "--memory=6g",
      "--cpus=4",
      "-e",
      "JAVA_TOOL_OPTIONS=-Xmx4g -XX:ActiveProcessorCount=4",
      "-v",
      `${dir}:/var/opentripplanner`,
      manifest.otpImage,
      "--build",
      "--save",
    ],
    { stdio: "inherit" },
  );
  child.on("error", fail);
  child.on("exit", ok);
});
if (code !== 0)
  throw Error("Staged graph build failed; active release untouched");
const built = {
  ...manifest,
  graphSha256: await fileHash(resolve(dir, "graph.obj")),
  builtAt: new Date().toISOString(),
};
await writeFile(
  resolve(dir, "graph-manifest.tmp"),
  JSON.stringify(built, null, 2),
);
await rename(
  resolve(dir, "graph-manifest.tmp"),
  resolve(dir, "graph-manifest.json"),
);
console.log(JSON.stringify({ release: id, built: true }));
