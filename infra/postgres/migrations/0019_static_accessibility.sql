ALTER TABLE place_external_identifier
 ADD COLUMN wheelchair_code integer CHECK(wheelchair_code BETWEEN 0 AND 2),
 ADD COLUMN location_type integer CHECK(location_type BETWEEN 0 AND 4),
 ADD COLUMN parent_station text,
 ADD COLUMN accessibility_imported_at timestamptz;
ALTER TABLE transit_trip
 ADD COLUMN wheelchair_code integer CHECK(wheelchair_code BETWEEN 0 AND 2),
 ADD COLUMN source_version text,
 ADD COLUMN accessibility_imported_at timestamptz;
