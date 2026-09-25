-- Catalog snapshots are not GTFS calendars or routing coverage.
CREATE TABLE emt_catalog (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version text NOT NULL, fetched_at timestamptz NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  manifest jsonb NOT NULL
);
CREATE TABLE emt_stop_line (
  stop_id text NOT NULL, line_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('1','2')),
  PRIMARY KEY (stop_id,line_id,direction)
);
CREATE TABLE emt_arrival_cache (
  stop_id text PRIMARY KEY,
  observed_at timestamptz, ingested_at timestamptz, payload jsonb,
  raw_reference text,
  next_due_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid, lease_until timestamptz,
  failures integer NOT NULL DEFAULT 0, error_code text
);
-- One provider-wide lane: bounded even when different stops are requested.
CREATE TABLE emt_arrival_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  next_due_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid, lease_until timestamptz,
  failures integer NOT NULL DEFAULT 0, error_code text
);
INSERT INTO emt_arrival_gate DEFAULT VALUES;
