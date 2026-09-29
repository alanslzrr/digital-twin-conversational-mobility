import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { deriveDestinationEvidence } from "../packages/domain/src/transit-identity.ts";
import {
  renfeAccessibility,
  storeRenfeAccessibility,
} from "./renfe-accessibility.mjs";
export async function importRenfe(sql, file) {
  const { manifest, stops, routes, trips, stopTimes } = JSON.parse(
    await readFile(file, "utf8"),
  );
  renfeAccessibility({ manifest, stops, trips });
  const stopNames = new Map(
    stops.map((stop) => [stop.stop_id, stop.stop_name]),
  );
  const timesByTrip = new Map();
  for (const time of stopTimes ?? []) {
    const times = timesByTrip.get(time.trip_id) ?? [];
    times.push(time);
    timesByTrip.set(time.trip_id, times);
  }
  const isoDate = (value) =>
    value.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
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
      await tx`INSERT INTO place_external_identifier(source_id,namespace,external_id,place_id,source_version) VALUES ('renfe','gtfs.stop',${stop.stop_id},${id},${manifest.staticVersion}) ON CONFLICT (source_id,namespace,external_id) DO UPDATE SET accessibility_imported_at=CASE WHEN place_external_identifier.source_version=excluded.source_version THEN place_external_identifier.accessibility_imported_at ELSE NULL END, source_version=excluded.source_version`;
    }
    await tx`DELETE FROM transit_trip WHERE source_id='renfe'`;
    await tx`DELETE FROM transit_route WHERE source_id='renfe'`;
    await tx`INSERT INTO transit_route ${tx(routes.map((r) => ({ source_id: "renfe", external_id: r.route_id, short_name: r.route_short_name, long_name: r.route_long_name })))}`;
    for (let index = 0; index < trips.length; index += 2000) {
      await tx`INSERT INTO transit_trip ${tx(trips.slice(index, index + 2000).map((t) => ({ source_id: "renfe", external_id: t.trip_id, route_id: t.route_id, headsign: t.trip_headsign ?? "", stops_unique: Boolean(timesByTrip.get(t.trip_id)?.length) && new Set((timesByTrip.get(t.trip_id) ?? []).map((s) => s.stop_id)).size === timesByTrip.get(t.trip_id).length, destination_evidence: tx.json(deriveDestinationEvidence(timesByTrip.get(t.trip_id), stopNames)) })))}`;
    }
    await storeRenfeAccessibility(tx, { manifest, stops, trips });
    // Retain identities across disappearance/reappearance; readers filter active source_version.
    await tx`INSERT INTO static_feed(source_id,version,service_start,service_end,manifest) VALUES ('renfe',${manifest.staticVersion},${isoDate(manifest.serviceStart)},${isoDate(manifest.serviceEnd)},${tx.json(manifest)}) ON CONFLICT (source_id) DO UPDATE SET version=excluded.version,service_start=excluded.service_start,service_end=excluded.service_end,manifest=excluded.manifest,imported_at=now()`;
    await tx`UPDATE source_catalog SET enabled=true, license_reviewed_at=now() WHERE id IN ('renfe','osm')`;
  });
  console.log(
    `Imported ${stops.length} Madrid stations, ${routes.length} routes, ${trips.length} trips. Valid ${manifest.serviceStart}–${manifest.serviceEnd}.`,
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const url = process.env.DATABASE_URL;
  if (
    !url ||
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
  )
    throw Error("This import is local-only");
  const sql = postgres(url, { max: 1 });
  try {
    await importRenfe(
      sql,
      process.argv[2] ??
        new URL("../data/sources/renfe-madrid.json", import.meta.url),
    );
  } finally {
    await sql.end();
  }
}
