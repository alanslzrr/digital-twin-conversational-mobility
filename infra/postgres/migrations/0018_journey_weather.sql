CREATE TABLE weather_municipality (
  code text PRIMARY KEY CHECK (code ~ '^28[0-9]{3}$'), name text NOT NULL,
  boundary geometry(MultiPolygon,4326) NOT NULL,
  source_version text NOT NULL, imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX weather_municipality_boundary ON weather_municipality USING gist(boundary);
CREATE TABLE weather_product (
  resource text PRIMARY KEY CHECK (resource='warnings:28' OR resource ~ '^forecast:28[0-9]{3}$'),
  payload jsonb, version text, issued_at timestamptz, valid_from timestamptz, valid_to timestamptz,
  fetched_at timestamptz, checked_at timestamptz, last_modified text,
  demanded_until timestamptz NOT NULL DEFAULT now(), next_due_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid, lease_until timestamptz, failures integer NOT NULL DEFAULT 0,
  error_code text, attempts bigint NOT NULL DEFAULT 0
);
CREATE TABLE weather_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  next_due_at timestamptz NOT NULL DEFAULT now(), lease_token uuid, lease_until timestamptz
);
INSERT INTO weather_gate DEFAULT VALUES;
