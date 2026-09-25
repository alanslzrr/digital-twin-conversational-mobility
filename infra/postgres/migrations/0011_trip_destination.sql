-- Null on old imports: never guess a terminal from the route's commercial name.
ALTER TABLE transit_trip ADD COLUMN destination_evidence jsonb;
