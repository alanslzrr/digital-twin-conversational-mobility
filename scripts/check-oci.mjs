import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

// Configuration-only validation: no engine start, resources, secrets or DNS calls.
const result = spawnSync(
  "docker",
  [
    "compose",
    "--env-file",
    "/dev/null",
    "-f",
    "infra/oci/compose.yaml",
    "--profile",
    "oci",
    "config",
    "--format",
    "json",
  ],
  {
    encoding: "utf8",
    env: {
      ...process.env,
      POSTGRES_USER: "mobai",
      POSTGRES_DB: "mobai",
      POSTGRES_PASSWORD: "validation-only",
      REDIS_PASSWORD: "validation-only",
      MOBAI_STATE_DIR: "/srv/mobai",
    },
  },
);
if (result.status !== 0)
  throw new Error("OCI Compose template invalid or Docker CLI unavailable");
const { services } = JSON.parse(result.stdout);
assert.deepEqual(Object.keys(services).sort(), ["otp", "postgres", "redis"]);
for (const service of Object.values(services)) {
  assert(service.profiles.includes("oci"));
  assert(service.ports.every((port) => port.host_ip === "127.0.0.1"));
  assert(
    service.volumes.every(
      (volume) =>
        volume.type === "bind" && volume.source.startsWith("/srv/mobai/"),
    ),
  );
  assert(service.mem_limit > 0);
}
assert(
  services.postgres.build.context.includes(
    "#2bcd236e3af9ec6e668db51eb37162a79f0eaeaa",
  ),
);
console.log(
  "OCI templates valid. No deployment, configuration writes, mail or inference performed.",
);
