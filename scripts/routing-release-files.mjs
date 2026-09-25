import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
export async function fileHash(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
export async function verifyRelease(directory, built = true) {
  const manifest = JSON.parse(
    await readFile(
      resolve(directory, built ? "graph-manifest.json" : "manifest.json"),
      "utf8",
    ),
  );
  if (
    !/^[a-f0-9]{64}$/.test(manifest.releaseId ?? "") ||
    !manifest.files ||
    !manifest.feeds
  )
    throw Error("Invalid routing release");
  for (const [name, hash] of Object.entries(manifest.files)) {
    const path = resolve(directory, name);
    if (
      !path.startsWith(resolve(directory) + sep) ||
      typeof hash !== "string" ||
      (await fileHash(path)) !== hash
    )
      throw Error("Release input checksum mismatch");
  }
  if (
    built &&
    (await fileHash(resolve(directory, "graph.obj"))) !== manifest.graphSha256
  )
    throw Error("Release graph checksum mismatch");
  return manifest;
}
