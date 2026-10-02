import { dashboardActivity, dashboardStatus } from "@mobility/contracts";
import { ingestionWorkerState } from "@mobility/domain";
import { database } from "../database";
import { activate, ingestionEnabled } from "../ingestion";

function iso(value: unknown) {
  if (value === null || value === undefined) return null;
  return value instanceof Date
    ? Number.isFinite(value.getTime())
      ? value.toISOString()
      : null
    : new Date(String(value)).toISOString();
}
export async function readDashboardStatus() {
  const sql = database();
  const enabled = ingestionEnabled();
  const [activity, workers, revisions] = await Promise.all([
    sql`SELECT active_until,active_until>now() AS active FROM ingestion_activity`,
    sql`SELECT id,last_seen_at,last_pruned_at,EXTRACT(EPOCH FROM now()-last_seen_at) AS age FROM ingestion_worker ORDER BY id LIMIT 2`,
    sql`SELECT 'snapshot:'||job_id AS id,ingested_at::text AS revision FROM mobility_snapshot
        UNION ALL SELECT 'static:'||source_id,version FROM static_feed`,
  ]);
  return dashboardStatus.parse({
    schemaVersion: 1,
    readAt: new Date().toISOString(),
    ingestionEnabled: enabled,
    activeUntil: iso(activity[0]?.active_until),
    workers: workers.map((worker) => ({
      id: String(worker.id),
      lastSeenAt: iso(worker.last_seen_at),
      lastPrunedAt: iso(worker.last_pruned_at),
      state: ingestionWorkerState(
        enabled,
        Boolean(activity[0]?.active),
        worker.age === null ? null : Number(worker.age),
      ),
    })),
    revisions: Object.fromEntries(
      revisions.map((row) => [String(row.id), String(row.revision)]),
    ),
    // Set by the installed capture implementation, not by the presence of tables.
    captureVersion: 1,
    captureCoverage: "best_effort",
  });
}

export async function renewDashboardActivity() {
  // activate() itself respects previews/localIngestionEnabled. Never tick/fanout.
  await activate();
  const [row] = await database()`SELECT active_until FROM ingestion_activity`;
  return dashboardActivity.parse({
    schemaVersion: 1,
    readAt: new Date().toISOString(),
    enabled: ingestionEnabled(),
    activeUntil: iso(row?.active_until),
  });
}
