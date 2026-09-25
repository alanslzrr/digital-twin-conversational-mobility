ALTER TABLE crtm_feed DROP CONSTRAINT crtm_feed_dataset_id_check;
ALTER TABLE crtm_feed ADD CHECK(dataset_id IN ('metro','light-rail','interurban','emt'));
ALTER TABLE transit_trip ADD COLUMN stops_unique boolean NOT NULL DEFAULT false;
CREATE TABLE routing_release (
  id text PRIMARY KEY, manifest jsonb NOT NULL,
  state text NOT NULL CHECK(state IN ('prepared','active','retired','failed')),
  created_at timestamptz NOT NULL DEFAULT now(), activated_at timestamptz
);
CREATE UNIQUE INDEX routing_single_active ON routing_release((state)) WHERE state='active';
CREATE TABLE routing_place_link (
  place_id uuid PRIMARY KEY REFERENCES canonical_place,
  feed_id text NOT NULL, stop_id text NOT NULL, static_version text NOT NULL,
  evidence text NOT NULL, distance_meters double precision NOT NULL CHECK(distance_meters BETWEEN 0 AND 100)
);
-- Reserve identities when rolling back a catalog that did not exist previously.
ALTER TABLE crtm_feed ADD COLUMN enabled boolean NOT NULL DEFAULT true;
