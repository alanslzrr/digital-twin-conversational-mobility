import type { SourceId } from "@mobility/contracts";
import { type JobId, jobPolicies } from "@mobility/domain";
import { getFreshness } from "@mobility/provenance";
import { database } from "./database";

export async function history(
  source: SourceId,
  at: string,
  mode: "event" | "knowledge" = "event",
) {
  const requested = new Date(at);
  const now = new Date();
  if (!Number.isFinite(requested.getTime()))
    return { status: "unavailable", reason: "invalid_timestamp" };
  if (requested > now || requested.getTime() < now.getTime() - 86400000)
    return { status: "unavailable", reason: "outside_24h_retention", at, mode };
  const sql = database();
  const [coverage] =
    await sql`SELECT min(h.ingested_at) AS earliest_ingestion,min(h.observed_at) AS earliest_observation,max(h.ingested_at) AS latest_ingestion
    FROM mobility_history h JOIN ingestion_job j ON j.id=h.job_id
    WHERE j.source_id=${source} AND h.ingested_at>=${new Date(now.getTime() - 86400000)}`;
  const rows = await sql`SELECT DISTINCT ON (h.job_id) h.*
    FROM mobility_history h JOIN ingestion_job j ON j.id=h.job_id
    WHERE j.source_id=${source} AND h.observed_at<=${requested}
      AND h.ingested_at>=${new Date(now.getTime() - 86400000)}
      AND (${mode}::text='event' OR h.ingested_at<=${requested})
    ORDER BY h.job_id,h.observed_at DESC,h.ingested_at DESC,h.revision_id DESC`;
  return {
    status: rows.length ? "available" : "unavailable",
    reason: rows.length ? null : "no_retained_observation_at_instant",
    kind: "historical_snapshot_index",
    at,
    mode,
    semantics:
      mode === "event"
        ? "May include observations or corrections learned after the requested instant."
        : "Only revisions ingested by the requested instant; not a complete reconstruction of the system.",
    coverage: { retentionHours: 24, ...coverage, complete: false },
    observations: rows.map((row) => {
      const provenance = {
        source,
        observedAt: new Date(row.observed_at).toISOString(),
        ingestedAt: new Date(row.ingested_at).toISOString(),
        quality: row.quality,
        rawReference: row.raw_reference,
      };
      return {
        job: row.job_id,
        ...provenance,
        provenanceScope: "collection_only",
        revisionId: String(row.revision_id),
        contentHash: row.content_hash ?? null,
        knownAfterRequestedTime:
          new Date(row.ingested_at).getTime() > requested.getTime(),
        parserVersion: row.parser_version ?? null,
        staticVersion: row.static_version ?? null,
        lagSeconds: Math.floor(
          (requested.getTime() - new Date(row.observed_at).getTime()) / 1000,
        ),
        freshnessAtRequestedTime: getFreshness(
          provenance,
          jobPolicies[row.job_id as JobId].maxAge,
          requested,
        ),
        categories: Object.fromEntries(
          Object.entries(row.payload as Record<string, unknown>).map(
            ([name, value]) => [
              name,
              Array.isArray(value)
                ? { total: value.length, sample: value.slice(0, 5) }
                : value,
            ],
          ),
        ),
      };
    }),
    note: "Partial index, at most five sample entities per category, no interpolation or live-data claims. Retention is based on first ingestion of each revision; repeated identical fetches do not extend its knowledge history. Legacy lost revisions cannot be recovered.",
  };
}
