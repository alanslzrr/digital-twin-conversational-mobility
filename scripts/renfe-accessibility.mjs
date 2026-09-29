import assert from "node:assert/strict";
export function renfeAccessibility(data) {
  assert.match(data.manifest.staticVersion, /^[a-f0-9]{64}$/);
  const code = (value, max) => {
    if (value === undefined || value === null || value === "") return 0;
    assert.match(String(value), new RegExp(`^[0-${max}]$`));
    return Number(value);
  };
  const stops = data.stops.map((s) => ({
    id: s.stop_id,
    code: code(s.wheelchair_boarding, 2),
    location_type: code(s.location_type, 4),
    parent: s.parent_station || null,
  }));
  const trips = data.trips.map((t) => ({
    id: t.trip_id,
    code: code(t.wheelchair_accessible, 2),
  }));
  for (const rows of [stops, trips]) {
    assert.ok(rows.length);
    assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
    for (const r of rows)
      assert.ok(typeof r.id === "string" && r.id.length > 0);
  }
  return { stops, trips, version: data.manifest.staticVersion };
}
export async function storeRenfeAccessibility(tx, data) {
  const { stops, trips, version } = renfeAccessibility(data);
  // Timestamp changes only when this entity/version's normalized attributes change.
  const saved =
    await tx`UPDATE place_external_identifier i SET wheelchair_code=r.code,location_type=r.location_type,parent_station=r.parent,accessibility_imported_at=CASE WHEN i.accessibility_imported_at IS NOT NULL AND i.wheelchair_code IS NOT DISTINCT FROM r.code AND i.location_type IS NOT DISTINCT FROM r.location_type AND i.parent_station IS NOT DISTINCT FROM r.parent THEN i.accessibility_imported_at ELSE now() END FROM jsonb_to_recordset(${tx.json(stops)}) AS r(id text,code integer,location_type integer,parent text) WHERE i.source_id='renfe' AND i.namespace='gtfs.stop' AND i.source_version=${version} AND i.external_id=r.id RETURNING i.external_id`;
  assert.equal(
    saved.length,
    stops.length,
    "Stop identities/version differ from export",
  );
  let count = 0;
  for (let index = 0; index < trips.length; index += 2000) {
    const rows =
      await tx`UPDATE transit_trip t SET wheelchair_code=r.code,source_version=${version},accessibility_imported_at=CASE WHEN t.accessibility_imported_at IS NOT NULL AND t.source_version=${version} AND t.wheelchair_code IS NOT DISTINCT FROM r.code THEN t.accessibility_imported_at ELSE now() END FROM jsonb_to_recordset(${tx.json(trips.slice(index, index + 2000))}) AS r(id text,code integer) WHERE t.source_id='renfe' AND t.external_id=r.id RETURNING t.external_id`;
    count += rows.length;
  }
  assert.equal(count, trips.length, "Trip identities differ from export");
}
export async function backfillRenfeAccessibility(sql, data, releaseId) {
  renfeAccessibility(data);
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(90123002)`;
    const [feed] =
      await tx`SELECT version FROM static_feed WHERE source_id='renfe' FOR UPDATE`;
    const [release] =
      await tx`SELECT id,manifest FROM routing_release WHERE state='active' FOR UPDATE`;
    assert.equal(feed?.version, data.manifest.staticVersion);
    assert.equal(release?.id, releaseId);
    assert.equal(
      release?.manifest.feeds.renfe.version,
      data.manifest.staticVersion,
    );
    const [count] =
      await tx`SELECT count(*)::int AS n FROM transit_trip WHERE source_id='renfe'`;
    assert.equal(count.n, data.trips.length);
    const [stopCount] =
      await tx`SELECT count(*)::int AS n FROM place_external_identifier WHERE source_id='renfe' AND namespace='gtfs.stop' AND source_version=${data.manifest.staticVersion}`;
    assert.equal(stopCount.n, data.stops.length);
    await storeRenfeAccessibility(tx, data);
  });
}
