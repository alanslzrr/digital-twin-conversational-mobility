CREATE TABLE geocode_cache (
  cache_key text PRIMARY KEY, provider text NOT NULL,
  fetched_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);
CREATE INDEX geocode_cache_expiry ON geocode_cache(expires_at);
CREATE TABLE geocode_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  next_due_at timestamptz NOT NULL DEFAULT now(), lease_token uuid, lease_until timestamptz,
  error_code text, failures integer NOT NULL DEFAULT 0
);
INSERT INTO geocode_gate DEFAULT VALUES;
