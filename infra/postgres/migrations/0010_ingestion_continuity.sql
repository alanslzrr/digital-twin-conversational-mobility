-- Per-job attempts survive worker/Core restarts; no provider bodies or secrets.
ALTER TABLE ingestion_job
  ADD COLUMN last_attempt_at timestamptz,
  ADD COLUMN last_finished_at timestamptz,
  ADD COLUMN error_stage text CHECK (error_stage IN ('source', 'raw_storage', 'publication')),
  ADD COLUMN attempts bigint NOT NULL DEFAULT 0,
  ADD COLUMN recovered_leases bigint NOT NULL DEFAULT 0;

-- A stale heartbeat means stopped OR unreachable, not proof of process death.
CREATE TABLE ingestion_worker (
  id text PRIMARY KEY CHECK (id IN ('0','1')),
  last_seen_at timestamptz,
  last_pruned_at timestamptz
);
INSERT INTO ingestion_worker(id) VALUES ('0'), ('1');
