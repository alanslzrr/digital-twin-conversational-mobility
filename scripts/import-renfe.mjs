import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { deriveDestinationEvidence } from "../packages/domain/src/transit-identity.ts";

const url = process.env.DATABASE_URL;
if (
  !url ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
)
  throw new Error("This import is local-only");
const { manifest, stops, routes, trips, stopTimes } = JSON.parse(
  await readFile(
    new URL("../data/sources/renfe-madrid.json", import.meta.url),
    "utf8",
  ),
);
const stopNames = new Map(stops.map((stop) => [stop.stop_id, stop.stop_name]));
const timesByTrip = new Map();
for (const time of stopTimes ?? []) {
  const times = timesByTrip.get(time.trip_id) ?? [];
  times.push(time);
  timesByTrip.set(time.trip_id, times);
}
const sql = postgres(url, { max: 1 });
const isoDate = (value) => value.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
try {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(90123002)`;
    for (const stop of stops) {
      const [identifier] =
        await tx`SELECT place_id FROM place_external_identifier WHERE source_id='renfe' AND namespace='gtfs.stop' AND external_id=${stop.stop_id}`;
      let id = identifier?.place_id;
      if (id) {
        await tx`UPDATE canonical_place SET name=${stop.stop_name}, location=ST_SetSRID(ST_MakePoint(${Number(stop.stop_lon)}, ${Number(stop.stop_lat)}),4326)::geography, updated_at=now() WHERE id=${id}`;
      } else {
        const [place] =
          await tx`INSERT INTO canonical_place(name,kind,location) VALUES (${stop.stop_name},'station',ST_SetSRID(ST_MakePoint(${Number(stop.stop_lon)},${Number(stop.stop_lat)}),4326)::geography) RETURNING id`;
        id = place.id;
      }
      await tx`INSERT INTO place_external_identifier(source_id,namespace,external_id,place_id,source_version) VALUES ('renfe','gtfs.stop',${stop.stop_id},${id},${manifest.staticVersion}) ON CONFLICT (source_id,namespace,external_id) DO UPDATE SET source_version=excluded.source_version`;
    }
    await tx`DELETE FROM transit_trip WHERE source_id='renfe'`;
    await tx`DELETE FROM transit_route WHERE source_id='renfe'`;
    await tx`INSERT INTO transit_route ${tx(routes.map((r) => ({ source_id: "renfe", external_id: r.route_id, short_name: r.route_short_name, long_name: r.route_long_name })))}`;
    for (let index = 0; index < trips.length; index += 2000) {
      await tx`INSERT INTO transit_trip ${tx(trips.slice(index, index + 2000).map((t) => ({ source_id: "renfe", external_id: t.trip_id, route_id: t.route_id, headsign: t.trip_headsign ?? "", destination_evidence: tx.json(deriveDestinationEvidence(timesByTrip.get(t.trip_id), stopNames)) })))}`;
    }
    await tx`DELETE FROM place_external_identifier WHERE source_id='renfe' AND namespace='gtfs.stop' AND source_version<>${manifest.staticVersion}`;
    await tx`INSERT INTO static_feed(source_id,version,service_start,service_end,manifest) VALUES ('renfe',${manifest.staticVersion},${isoDate(manifest.serviceStart)},${isoDate(manifest.serviceEnd)},${tx.json(manifest)}) ON CONFLICT (source_id) DO UPDATE SET version=excluded.version,service_start=excluded.service_start,service_end=excluded.service_end,manifest=excluded.manifest,imported_at=now()`;
    await tx`UPDATE source_catalog SET enabled=true, license_reviewed_at=now() WHERE id IN ('renfe','osm')`;
  });
  console.log(
    `Imported ${stops.length} Madrid stations, ${routes.length} routes, ${trips.length} trips. Valid ${manifest.serviceStart}–${manifest.serviceEnd}.`,
  );
} finally {
  await sql.end();
}
