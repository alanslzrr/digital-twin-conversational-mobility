CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE source_catalog (
  id text PRIMARY KEY,
  strategy text NOT NULL CHECK (strategy IN ('continuous', 'snapshot', 'hybrid')),
  enabled boolean NOT NULL DEFAULT false,
  license_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO source_catalog (id, strategy) VALUES
  ('renfe', 'continuous'), ('emt', 'hybrid'), ('bicimad', 'continuous'),
  ('crtm', 'snapshot'), ('aemet', 'continuous'), ('dgt', 'continuous'),
  ('madrid-air', 'continuous'), ('madrid-traffic', 'continuous'),
  ('madrid-parking', 'continuous'), ('osm', 'snapshot');

CREATE TABLE canonical_place (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('station', 'stop', 'interchange', 'entrance', 'bike_station', 'parking', 'address')),
  location geography(Point, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX canonical_place_location_idx ON canonical_place USING gist (location);

CREATE TABLE place_external_identifier (
  source_id text NOT NULL REFERENCES source_catalog(id),
  external_id text NOT NULL,
  namespace text NOT NULL,
  place_id uuid NOT NULL REFERENCES canonical_place(id),
  source_version text,
  PRIMARY KEY (source_id, namespace, external_id)
);
CREATE INDEX place_external_identifier_place_idx ON place_external_identifier(place_id);

CREATE TABLE source_health (
  source_id text PRIMARY KEY REFERENCES source_catalog(id),
  status text NOT NULL DEFAULT 'not_initialized'
    CHECK (status IN ('not_initialized', 'healthy', 'degraded', 'unavailable')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_observed_at timestamptz,
  error_code text
);
INSERT INTO source_health(source_id) SELECT id FROM source_catalog;

CREATE TABLE raw_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES source_catalog(id),
  object_key text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  fetched_at timestamptz NOT NULL,
  expires_at timestamptz,
  parser_version text,
  content_type text NOT NULL,
  CHECK (expires_at IS NULL OR expires_at > fetched_at)
);
CREATE INDEX raw_batch_source_time_idx ON raw_batch(source_id, fetched_at DESC);
