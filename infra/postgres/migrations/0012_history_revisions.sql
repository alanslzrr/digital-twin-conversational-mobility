-- Preserve surviving rows and their original knowledge time. Lost corrections
-- cannot be reconstructed. Null parser versions explicitly mean legacy/unknown.
ALTER TABLE mobility_history DROP CONSTRAINT mobility_history_pkey;
ALTER TABLE mobility_history
  ADD COLUMN revision_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ADD COLUMN parser_version text,
  ADD COLUMN content_hash text CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN static_version text;
UPDATE mobility_history SET static_version=payload->>'staticVersion';
CREATE INDEX mobility_history_event_revision_idx
  ON mobility_history(job_id,observed_at DESC,ingested_at DESC,revision_id DESC);
-- Deduplication is against the last revision of the observation while holding
-- its job lease/row lock, not a global hash constraint: A -> B -> A is a revision.
