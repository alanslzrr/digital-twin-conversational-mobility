import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const name = `mobai-control-test-${randomUUID().slice(0, 8)}`;
const image = process.env.MOBAI_TEST_POSTGRES_IMAGE || "postgis/postgis:17-3.5";
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0)
    throw new Error(`${command} failed: ${result.stderr ?? ""}`);
  return result.stdout.trim();
}
// An existing image is required. This command never downloads or touches the application's database.
run("docker", ["image", "inspect", image]);
try {
  run("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    name,
    "--label",
    "mobai-purpose=offline-control-tests",
    "-e",
    "POSTGRES_PASSWORD=local-test-only",
    "-e",
    "POSTGRES_DB=mobai_control_test",
    "-p",
    "127.0.0.1::5432",
    image,
  ]);
  const port = run("docker", ["port", name, "5432/tcp"]).split(":").at(-1);
  const url = `postgres://postgres:local-test-only@127.0.0.1:${port}/mobai_control_test`;
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    // The entrypoint's temporary Unix-socket server also answers pg_isready.
    // Probe the published TCP port instead; only the final server exposes it.
    const probe = postgres(url, {
      max: 1,
      connect_timeout: 1,
      idle_timeout: 1,
    });
    try {
      await probe`SELECT 1`;
      ready = true;
    } catch {
      /* Initialization is still running. */
    } finally {
      await probe.end({ timeout: 1 });
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "apps/mobility-core/src/control/control.integration.test.ts",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        RUN_CONTROL_DB_TESTS: "1",
        MOBAI_TEST_DATABASE_URL: url,
        DEPLOYMENT_ENV: "test",
        VERCEL_ENV: "development",
      },
    },
  );
  process.exitCode = result.status ?? 1;
} finally {
  spawnSync("docker", ["stop", name], { stdio: "ignore" });
}
