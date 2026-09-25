-- Dataset-scoped identities: identical labels never merge operators or networks.
CREATE TABLE crtm_feed (
  dataset_id text PRIMARY KEY CHECK (dataset_id IN ('metro','light-rail','interurban')),
  version text NOT NULL, fetched_at timestamptz NOT NULL, published_at timestamptz NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  service_start date NOT NULL, service_end date NOT NULL,
  manifest jsonb NOT NULL, CHECK (service_end >= service_start)
);
-- Retained across snapshot replacement, including disappeared/reappearing stops.
CREATE TABLE crtm_stop_identity (
  dataset_id text NOT NULL REFERENCES crtm_feed,
  external_id text NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  PRIMARY KEY (dataset_id, external_id)
);
CREATE TABLE crtm_stops (
  dataset_id text NOT NULL REFERENCES crtm_feed, external_id text NOT NULL,
  stop_code text, name text NOT NULL, latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180), parent_id text,
  location_type integer NOT NULL CHECK(location_type BETWEEN 0 AND 2),
  wheelchair integer NOT NULL CHECK(wheelchair BETWEEN 0 AND 2),
  PRIMARY KEY(dataset_id,external_id),
  FOREIGN KEY(dataset_id,parent_id) REFERENCES crtm_stops DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE crtm_routes (
  dataset_id text NOT NULL REFERENCES crtm_feed, external_id text NOT NULL,
  agency_id text NOT NULL, short_name text, long_name text, route_type integer NOT NULL,
  PRIMARY KEY(dataset_id,external_id)
);
CREATE TABLE crtm_trips (
  dataset_id text NOT NULL REFERENCES crtm_feed, external_id text NOT NULL,
  route_id text NOT NULL, service_id text NOT NULL, headsign text,
  direction integer CHECK(direction IN (0,1)), wheelchair integer NOT NULL CHECK(wheelchair BETWEEN 0 AND 2),
  PRIMARY KEY(dataset_id,external_id), FOREIGN KEY(dataset_id,route_id) REFERENCES crtm_routes
);
CREATE TABLE crtm_stop_times (
  dataset_id text NOT NULL, trip_id text NOT NULL, sequence integer NOT NULL CHECK(sequence >= 0),
  stop_id text NOT NULL, arrival_seconds integer CHECK(arrival_seconds BETWEEN 0 AND 259199),
  departure_seconds integer CHECK(departure_seconds BETWEEN 0 AND 259199), headsign text,
  pickup_type integer NOT NULL CHECK(pickup_type BETWEEN 0 AND 3),
  drop_off_type integer NOT NULL CHECK(drop_off_type BETWEEN 0 AND 3),
  timepoint integer NOT NULL CHECK(timepoint IN (0,1)),
  PRIMARY KEY(dataset_id,trip_id,sequence),
  FOREIGN KEY(dataset_id,trip_id) REFERENCES crtm_trips,
  FOREIGN KEY(dataset_id,stop_id) REFERENCES crtm_stops,
  CHECK(departure_seconds >= arrival_seconds)
);
CREATE INDEX crtm_stop_times_stop ON crtm_stop_times(dataset_id,stop_id,departure_seconds);
CREATE TABLE crtm_calendar (
  dataset_id text NOT NULL REFERENCES crtm_feed, service_id text NOT NULL,
  start_date date NOT NULL, end_date date NOT NULL, weekdays integer[] NOT NULL,
  PRIMARY KEY(dataset_id,service_id), CHECK(end_date >= start_date),
  CHECK(weekdays <@ ARRAY[1,2,3,4,5,6,7])
);
CREATE TABLE crtm_exceptions (
  dataset_id text NOT NULL REFERENCES crtm_feed, service_id text NOT NULL,
  date date NOT NULL, exception_type integer NOT NULL CHECK(exception_type IN (1,2)),
  PRIMARY KEY(dataset_id,service_id,date)
);
CREATE TABLE crtm_frequencies (
  dataset_id text NOT NULL, trip_id text NOT NULL,
  start_seconds integer NOT NULL CHECK(start_seconds >= 0),
  end_seconds integer NOT NULL CHECK(end_seconds <= 259199),
  headway_seconds integer NOT NULL CHECK(headway_seconds BETWEEN 1 AND 86400),
  exact_times integer NOT NULL CHECK(exact_times IN (0,1)),
  PRIMARY KEY(dataset_id,trip_id,start_seconds),
  FOREIGN KEY(dataset_id,trip_id) REFERENCES crtm_trips,
  CHECK(end_seconds > start_seconds)
);
CREATE INDEX crtm_stops_parent ON crtm_stops(dataset_id,parent_id);
CREATE INDEX crtm_trips_route ON crtm_trips(dataset_id,route_id);
CREATE INDEX crtm_trips_service ON crtm_trips(dataset_id,service_id);
