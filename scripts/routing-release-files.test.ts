import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
// @ts-expect-error Runtime script is intentionally plain Node ESM.
import { fileHash, verifyRelease } from "./routing-release-files.mjs";

it("verifies immutable input and graph hashes and rejects tampering/traversal", async () => {
  const dir = await mkdtemp(join(tmpdir(), "routing-release-"));
  try {
    await writeFile(join(dir, "input"), "fixture");
    await writeFile(join(dir, "graph.obj"), "fixture graph");
    const manifest = {
      releaseId: "a".repeat(64),
      feeds: { renfe: {} },
      files: { input: await fileHash(join(dir, "input")) },
      graphSha256: await fileHash(join(dir, "graph.obj")),
    };
    await writeFile(join(dir, "graph-manifest.json"), JSON.stringify(manifest));
    expect((await verifyRelease(dir)).releaseId).toBe(manifest.releaseId);
    await writeFile(join(dir, "input"), "modified");
    await expect(verifyRelease(dir)).rejects.toThrow("checksum");
    await writeFile(
      join(dir, "graph-manifest.json"),
      JSON.stringify({ ...manifest, files: { "../outside": "hash" } }),
    );
    await expect(verifyRelease(dir)).rejects.toThrow("checksum");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
