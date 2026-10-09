import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { webPort } from "./runtime-config.mjs";

test("public HTTPS origin never becomes a privileged listening port", () => {
  assert.equal(
    webPort({ EVALUATION_ORIGIN: "https://mobai.example.org" }),
    3000,
  );
  assert.equal(
    webPort({ EVALUATION_ORIGIN: "https://mobai.example.org:8443" }),
    3000,
  );
  assert.equal(webPort({ EVALUATION_ORIGIN: "http://127.0.0.1:3010" }), 3010);
  assert.equal(
    webPort({
      EVALUATION_ORIGIN: "https://mobai.example.org",
      MOBAI_WEB_PORT: "3010",
    }),
    3010,
  );
  for (const port of ["443", "-1", "65536", "invalid"])
    assert.throws(() => webPort({ MOBAI_WEB_PORT: port }));
});
test("OCI templates keep internal services private and activation explicit", () => {
  const compose = readFileSync("infra/oci/compose.yaml", "utf8");
  assert.equal((compose.match(/profiles: \[oci\]/g) ?? []).length, 3);
  assert.equal((compose.match(/ports: \["127\.0\.0\.1:/g) ?? []).length, 3);
  assert.doesNotMatch(compose, /platform: linux\/amd64/);
  assert.match(compose, /docker-postgis\.git#[a-f0-9]{40}:17-3\.5\/alpine/);
  const service = readFileSync("infra/oci/mobai.service", "utf8");
  assert.match(service, /User=mobai/);
  assert.match(service, /RequiresMountsFor=\/srv\/mobai/);
  assert.doesNotMatch(service, /EnvironmentFile=/);
  const caddy = readFileSync("infra/oci/Caddyfile", "utf8");
  assert.match(caddy, /reverse_proxy 127\.0\.0\.1:3000/);
  assert.doesNotMatch(caddy, /reverse_proxy[^\n]*:(?:3001|4274|55432|8801)/);
  for (const config of [
    "apps/eve-web/vercel.json",
    "apps/mobility-core/vercel.json",
  ])
    assert.equal(JSON.parse(readFileSync(config)).git.deploymentEnabled, false);
});
