import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);
const compose = [
  "compose",
  "--env-file",
  ".env.local",
  "-f",
  "infra/local/compose.yaml",
];
const query = async (query, variables = {}) => {
  const response = await fetch("http://127.0.0.1:8801/otp/gtfs/v1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.errors, undefined);
  return result.data;
};
let startupMs = null;
if (process.argv.includes("--restart")) {
  await exec("docker", [...compose, "stop", "otp"]);
  const start = performance.now();
  await exec("docker", [...compose, "--profile", "routing", "up", "-d", "otp"]);
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      await query("{feeds{feedId}}");
      ready = true;
      break;
    } catch {
      await setTimeout(500);
    }
  }
  assert.ok(ready, "OTP did not become ready in 60s");
  startupMs = Math.round(performance.now() - start);
}
const pairs = [
  ["18000", "17000"],
  ["17000", "18000"],
  ["18101", "18000"],
  ["18000", "18101"],
];
const durations = [];
for (let i = 0; i < 20; i++) {
  const [origin, destination] = pairs[i % pairs.length];
  const start = performance.now();
  const data = await query(
    `query($from:PlanLabeledLocationInput!,$to:PlanLabeledLocationInput!){planConnection(origin:$from,destination:$to,first:3){routingErrors{code}edges{node{duration}}}}`,
    {
      from: {
        location: { stopLocation: { stopLocationId: `renfe:${origin}` } },
      },
      to: {
        location: { stopLocation: { stopLocationId: `renfe:${destination}` } },
      },
    },
  );
  assert.ok(data.planConnection.edges.length > 0);
  durations.push(Math.round(performance.now() - start));
}
const stats = await exec("docker", [
  "stats",
  "--no-stream",
  "--format",
  "{{.MemUsage}}",
  "mobility-twin-local-otp-1",
]);
const sorted = [...durations].sort((a, b) => a - b);
const manifest = JSON.parse(
  await readFile("data/otp/graph-manifest.json", "utf8"),
);
const report = {
  measuredAt: new Date().toISOString(),
  otpVersion: "2.10.0",
  staticVersion: manifest.staticVersion,
  startupMs,
  samples: durations.length,
  queryMs: durations,
  p50Ms: sorted[9],
  p95Ms: sorted[18],
  memoryAfterQueries: stats.stdout.trim(),
  limits: { heapGiB: 4, containerGiB: 6, cpus: 4 },
  note: "Local small sample over four station pairs, scheduled Renfe only. Not peak build RAM, full network validation or cloud performance.",
};
await writeFile("data/otp/benchmark.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
