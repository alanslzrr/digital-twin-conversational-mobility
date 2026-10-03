import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
for (const key of ["dependencies", "devDependencies", "optionalDependencies"])
  assert.equal(
    manifest[key]?.vercel,
    undefined,
    "Do not restore an unaudited deployment CLI",
  );
const cwd = mkdtempSync(join(tmpdir(), "mobility-cloud-disabled-"));
try {
  for (const args of [[], ["--apply"]]) {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("./configure-vercel.mjs", import.meta.url)),
        ...args,
      ],
      {
        cwd,
        env: {},
        encoding: "utf8",
        timeout: 5000,
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Cloud configuration disabled/);
    assert.equal(result.stdout, "");
    assert.deepEqual(
      readdirSync(cwd),
      [],
      "Disabled configuration must not write environment files",
    );
  }
  console.log(
    "Cloud configurator fails closed without credentials, network commands or file writes",
  );
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
