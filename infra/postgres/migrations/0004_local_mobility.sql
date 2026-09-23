CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE static_feed (
  source_id text PRIMARY KEY REFERENCES source_catalog(id),
  version text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  service_start date NOT NULL,
  service_end date NOT NULL,
  manifest jsonb NOT NULL
);
CREATE TABLE transit_route (
  source_id text NOT NULL REFERENCES source_catalog(id),
  external_id text NOT NULL,
  short_name text NOT NULL,
  long_name text NOT NULL,
  PRIMARY KEY (source_id, external_id)
);
CREATE TABLE transit_trip (
  source_id text NOT NULL,
  external_id text NOT NULL,
  route_id text NOT NULL,
  headsign text NOT NULL,
  PRIMARY KEY (source_id, external_id),
  FOREIGN KEY (source_id, route_id) REFERENCES transit_route(source_id, external_id)
);

CREATE TABLE ingestion_activity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  active_until timestamptz NOT NULL DEFAULT '-infinity'
);
INSERT INTO ingestion_activity DEFAULT VALUES;

CREATE TABLE ingestion_job (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES source_catalog(id),
  next_due_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_token uuid,
  failures integer NOT NULL DEFAULT 0,
  observed_at timestamptz,
  ingested_at timestamptz,
  error_code text
);
INSERT INTO ingestion_job(id, source_id) VALUES
  ('renfe-trips', 'renfe'), ('renfe-alerts', 'renfe'),
  ('bicimad', 'bicimad'), ('madrid-air', 'madrid-air'),
  ('madrid-traffic', 'madrid-traffic');

CREATE TABLE mobility_snapshot (
  job_id text PRIMARY KEY REFERENCES ingestion_job(id),
  source_id text NOT NULL REFERENCES source_catalog(id),
  observed_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL,
  quality text NOT NULL CHECK (quality IN ('validated', 'provisional', 'unknown')),
  raw_reference text NOT NULL,
  payload jsonb NOT NULL
);
CREATE TABLE mobility_history (
  job_id text NOT NULL REFERENCES ingestion_job(id),
  observed_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL,
  quality text NOT NULL CHECK (quality IN ('validated', 'provisional', 'unknown')),
  raw_reference text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (job_id, observed_at)
);
CREATE INDEX mobility_history_retention_idx ON mobility_history(ingested_at);
