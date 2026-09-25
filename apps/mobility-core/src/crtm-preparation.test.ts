import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("normalizes CRTM identities, repeated stops and frequency semantics offline", () => {
  const script = fileURLToPath(
    new URL("../../../scripts/test_prepare_crtm.py", import.meta.url),
  );
  expect(() =>
    execFileSync("python3", [script], { timeout: 30_000, stdio: "pipe" }),
  ).not.toThrow();
});
