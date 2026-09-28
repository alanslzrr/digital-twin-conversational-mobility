-- Reuse the bounded worker, snapshot/history revisions and source health.
INSERT INTO ingestion_job(id,source_id) VALUES ('dgt-incidents','dgt');
UPDATE source_catalog SET enabled=true WHERE id='dgt';
-- Current identity/lifecycle only; full correction evidence stays in mobility_history.
CREATE TABLE dgt_incident (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  last_seen_at timestamptz NOT NULL,
  withdrawn_at timestamptz
);
