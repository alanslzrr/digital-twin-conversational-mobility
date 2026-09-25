import type postgres from "postgres";
import type { parseEmtCatalog } from "../adapters/emt-transit.ts";

export async function storeEmtCatalog(
  sql: ReturnType<typeof postgres>,
  catalog: ReturnType<typeof parseEmtCatalog>,
  manifest: {
    version: string;
    fetchedAt: string;
    [key: string]: postgres.JSONValue;
  },
) {
  const { version, fetchedAt } = manifest;
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(90123003)`;
    for (const stop of catalog.stops) {
      const [existing] =
        await tx`SELECT place_id FROM place_external_identifier WHERE source_id='emt' AND namespace='api.stop' AND external_id=${stop.node}`;
      const [lon, lat] = stop.geometry.coordinates;
      let id = existing?.place_id;
      if (id)
        await tx`UPDATE canonical_place SET name=${stop.name},location=ST_SetSRID(ST_MakePoint(${lon},${lat}),4326)::geography,updated_at=now() WHERE id=${id}`;
      else {
        const [place] =
          await tx`INSERT INTO canonical_place(name,kind,location) VALUES(${stop.name},'stop',ST_SetSRID(ST_MakePoint(${lon},${lat}),4326)::geography) RETURNING id`;
        if (!place) throw new Error("emt_catalog_insert_failed");
        id = place.id;
      }
      await tx`INSERT INTO place_external_identifier(source_id,namespace,external_id,place_id,source_version) VALUES('emt','api.stop',${stop.node},${id},${version}) ON CONFLICT(source_id,namespace,external_id) DO UPDATE SET source_version=excluded.source_version`;
      await tx`INSERT INTO emt_arrival_cache(stop_id) VALUES(${stop.node}) ON CONFLICT DO NOTHING`;
    }
    await tx`DELETE FROM emt_stop_line`;
    const memberships = catalog.stops.flatMap((s) =>
      [...new Set(s.lines)].map((ref) => {
        const [line, direction] = ref.split("/");
        return { stop_id: s.node, line_id: line, direction };
      }),
    );
    for (let i = 0; i < memberships.length; i += 2000)
      await tx`INSERT INTO emt_stop_line ${tx(memberships.slice(i, i + 2000))}`;
    for (const line of catalog.lines)
      await tx`INSERT INTO transit_route(source_id,external_id,short_name,long_name) VALUES('emt',${line.line},${line.label},${`${line.nameA} — ${line.nameB}`}) ON CONFLICT(source_id,external_id) DO UPDATE SET short_name=excluded.short_name,long_name=excluded.long_name`;
    await tx`DELETE FROM transit_route WHERE source_id='emt' AND external_id NOT IN ${tx(catalog.lines.map((l) => l.line))}`;
    // Keep historical identifiers for stable UUIDs on reappearance; resolver filters
    // current source_version. Removed stops cannot initiate provider requests.
    await tx`DELETE FROM emt_arrival_cache WHERE stop_id NOT IN ${tx(catalog.stops.map((s) => s.node))}`;
    await tx`INSERT INTO emt_catalog(singleton,version,fetched_at,manifest) VALUES(true,${version},${fetchedAt},${tx.json(manifest)}) ON CONFLICT(singleton) DO UPDATE SET version=excluded.version,fetched_at=excluded.fetched_at,manifest=excluded.manifest,imported_at=now()`;
  });
}
