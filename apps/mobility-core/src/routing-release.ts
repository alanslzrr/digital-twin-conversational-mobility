import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { madridDate } from "@mobility/domain";
import { z } from "zod";
import { database } from "./database";

const schema = z.object({
  releaseId: z.string().regex(/^[a-f0-9]{64}$/),
  staticVersion: z.string(),
  catalogs: z.record(z.string(), z.string()),
  feeds: z.record(
    z.string(),
    z.object({
      version: z.string(),
      serviceStart: z.string(),
      serviceEnd: z.string(),
    }),
  ),
  coverage: z.unknown(),
});
export type RoutingRelease = z.infer<typeof schema>;
// No per-query hashing of hundreds of MB: activation verifies immutable inputs,
// and queries verify the active database versions plus the maintenance journal.
export async function routingRelease(): Promise<RoutingRelease | null> {
  const home = process.env.LOCAL_DATA_DIR ?? "../../data";
  try {
    await access(resolve(home, "runtime/routing-transition.json"));
    throw Error("routing_update_in_progress");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  const raw = JSON.parse(
    await readFile(resolve(home, "otp/graph-manifest.json"), "utf8"),
  );
  if (!raw.releaseId) return null; // Legacy Renfe-only installation.
  const manifest = schema.parse(raw);
  const [active] =
    await database()`SELECT id,manifest FROM routing_release WHERE state='active'`;
  if (active?.id !== manifest.releaseId || !active.manifest.otpVerifiedAt)
    throw Error("graph_static_version_mismatch");
  const feeds =
    await database()`SELECT dataset_id,version FROM crtm_feed WHERE enabled`;
  const [renfe] =
    await database()`SELECT version FROM static_feed WHERE source_id='renfe'`;
  if (
    renfe?.version !== manifest.staticVersion ||
    Object.entries(manifest.catalogs).some(
      ([id, version]) =>
        !feeds.some((row) => row.dataset_id === id && row.version === version),
    ) ||
    feeds.length !== Object.keys(manifest.catalogs).length
  )
    throw Error("graph_static_version_mismatch");
  return manifest;
}
export function coveredFeeds(release: RoutingRelease, date: string) {
  const day = madridDate(new Date(date));
  return Object.entries(release.feeds)
    .filter(([, feed]) => feed.serviceStart <= day && feed.serviceEnd >= day)
    .map(([id]) => id);
}
