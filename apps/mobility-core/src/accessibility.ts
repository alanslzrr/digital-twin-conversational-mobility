import type {
  AccessibilityDeclaration,
  AccessibilityRef,
} from "@mobility/contracts";
import {
  type AccessibilityRecord,
  accessibilityKey,
  interpretAccessibility,
  unknownAccessibility,
} from "@mobility/domain";
import { accessibilityServiceEnvelope } from "@mobility/provenance";
import type postgres from "postgres";
import { database } from "./database";

type Sql = postgres.Sql | postgres.TransactionSql;
const iso = (v: unknown) =>
  v instanceof Date ? v.toISOString() : typeof v === "string" ? v : null;
export async function readAccessibility(
  refs: AccessibilityRef[],
  provided?: Sql,
) {
  const unique = [
    ...new Map(refs.map((r) => [accessibilityKey(r), r])).values(),
  ].slice(0, 300);
  const results = new Map<string, AccessibilityDeclaration>(
    unique.map((r) => [accessibilityKey(r), unknownAccessibility(r)]),
  );
  if (!unique.length) return results;
  try {
    const sql = provided ?? database();
    // One batch per feed family; parent joins never cross feeds or versions.
    const requested = sql.json(unique);
    const query = (
      reader: Sql,
    ) => reader`WITH wanted AS (SELECT * FROM jsonb_to_recordset(${requested}) AS x(feed text,version text,entity text,"externalId" text)), entities AS (
    SELECT w.feed,w.entity,w."externalId" AS id,i.source_version AS version,i.wheelchair_code AS code,i.location_type,i.parent_station AS parent_id,i.accessibility_imported_at AS attribute_at,
      p.wheelchair_code AS parent_code,p.location_type AS parent_type,p.parent_station AS parent_parent,p.accessibility_imported_at AS parent_attribute_at,
      f.imported_at,f.service_start::text,f.service_end::text,f.manifest,NULL::timestamptz AS fetched_at,NULL::timestamptz AS published_at,'renfe'::text AS source,ARRAY[]::text[] AS lines
    FROM wanted w JOIN place_external_identifier i ON w.feed='renfe' AND w.entity='stop' AND i.source_id='renfe' AND i.namespace='gtfs.stop' AND i.external_id=w."externalId"
    JOIN static_feed f ON f.source_id='renfe' AND f.version=i.source_version
    LEFT JOIN place_external_identifier p ON p.source_id=i.source_id AND p.namespace=i.namespace AND p.source_version=i.source_version AND p.external_id=i.parent_station
    UNION ALL
    SELECT w.feed,w.entity,w."externalId",t.source_version,t.wheelchair_code,NULL,NULL,t.accessibility_imported_at,NULL,NULL,NULL,NULL,f.imported_at,f.service_start::text,f.service_end::text,f.manifest,NULL,NULL,'renfe',ARRAY[]::text[]
    FROM wanted w JOIN transit_trip t ON w.feed='renfe' AND w.entity='trip' AND t.source_id='renfe' AND t.external_id=w."externalId" JOIN static_feed f ON f.source_id=t.source_id AND f.version=t.source_version
    UNION ALL
    SELECT w.feed,w.entity,w."externalId",f.version,s.wheelchair,s.location_type,s.parent_id,f.imported_at,p.wheelchair,p.location_type,p.parent_id,f.imported_at,f.imported_at,f.service_start::text,f.service_end::text,f.manifest,f.fetched_at,f.published_at,'crtm',
      CASE WHEN w.feed='light-rail' THEN ARRAY(SELECT DISTINCT r.short_name FROM crtm_stop_times st JOIN crtm_trips t ON t.dataset_id=st.dataset_id AND t.external_id=st.trip_id JOIN crtm_routes r ON r.dataset_id=t.dataset_id AND r.external_id=t.route_id JOIN crtm_stops child ON child.dataset_id=st.dataset_id AND child.external_id=st.stop_id WHERE st.dataset_id=s.dataset_id AND (st.stop_id=s.external_id OR child.parent_id=s.external_id) AND r.short_name IN ('ML2','ML3')) ELSE ARRAY[]::text[] END
    FROM wanted w JOIN crtm_stops s ON w.entity='stop' AND s.dataset_id=w.feed AND s.external_id=w."externalId" JOIN crtm_feed f ON f.dataset_id=s.dataset_id AND f.enabled
    LEFT JOIN crtm_stops p ON p.dataset_id=s.dataset_id AND p.external_id=s.parent_id
    UNION ALL
    SELECT w.feed,w.entity,w."externalId",f.version,t.wheelchair,NULL,NULL,f.imported_at,NULL,NULL,NULL,NULL,f.imported_at,f.service_start::text,f.service_end::text,f.manifest,f.fetched_at,f.published_at,'crtm',ARRAY[]::text[]
    FROM wanted w JOIN crtm_trips t ON w.entity='trip' AND t.dataset_id=w.feed AND t.external_id=w."externalId" JOIN crtm_feed f ON f.dataset_id=t.dataset_id AND f.enabled
  ) SELECT * FROM entities`;
    const rows =
      "savepoint" in sql
        ? await sql.savepoint((tx) => query(tx))
        : await query(sql);
    for (const ref of unique) {
      const matches = rows.filter(
        (r) =>
          r.feed === ref.feed &&
          r.entity === ref.entity &&
          r.id === ref.externalId,
      );
      if (matches.length !== 1) continue;
      const r = matches[0];
      if (!r) continue;
      const provenance = {
        source: r.source,
        feed: r.feed,
        version: r.version,
        sourceUrl: r.manifest.sourceUrl ?? r.manifest.sources?.[0]?.url ?? null,
        ingestedAt: iso(r.attribute_at),
        catalogImportedAt: iso(r.imported_at),
        publishedAt: iso(r.published_at) ?? r.manifest.publishedAt ?? null,
        fetchedAt: iso(r.fetched_at) ?? r.manifest.fetchedAt ?? null,
        preparedAt: r.manifest.preparedAt ?? null,
        serviceStart: r.service_start,
        serviceEnd: r.service_end,
        currentServiceEnvelope: accessibilityServiceEnvelope(
          r.service_start,
          r.service_end,
        ),
        temporalWarning:
          accessibilityServiceEnvelope(r.service_start, r.service_end) === false
            ? "outside_service_envelope_static_declaration_only"
            : null,
        inspectionAt: null,
        realtime: false as const,
      };
      const row: AccessibilityRecord = {
        ...ref,
        version: r.version,
        code: r.code,
        locationType: r.location_type,
        parentId: r.parent_id,
        lines: r.lines,
        provenance,
      };
      const parent: AccessibilityRecord | undefined = r.parent_id
        ? {
            feed: r.feed,
            version: r.version,
            entity: "stop",
            externalId: r.parent_id,
            code: r.parent_code,
            locationType: r.parent_type,
            parentId: r.parent_parent,
            provenance: {
              ...provenance,
              ingestedAt: iso(r.parent_attribute_at),
            },
          }
        : undefined;
      results.set(
        accessibilityKey(ref),
        interpretAccessibility(ref, row, parent),
      );
    }
  } catch {
    for (const ref of unique)
      results.set(
        accessibilityKey(ref),
        unknownAccessibility(ref, "accessibility_storage_unavailable"),
      );
  }
  return results;
}
export function accessibilityFrom(
  results: Map<string, AccessibilityDeclaration>,
  ref: AccessibilityRef,
) {
  return (
    results.get(accessibilityKey(ref)) ??
    unknownAccessibility(ref, "identity_unavailable_or_bound_exceeded")
  );
}
export async function placeAccessibility(
  places: {
    id: string;
    identifiers: {
      source: string;
      externalId: string;
      sourceVersion?: string;
    }[];
  }[],
) {
  const sql = database();
  const refs = new Map<string, AccessibilityRef>();
  try {
    const emt = places
      .filter((p) => p.identifiers.some((i) => i.source === "emt"))
      .map((p) => p.id);
    const links = emt.length
      ? await sql`SELECT l.place_id,l.feed_id,l.stop_id,l.static_version FROM routing_place_link l JOIN crtm_feed f ON f.dataset_id=l.feed_id AND f.version=l.static_version AND f.enabled JOIN canonical_place p ON p.id=l.place_id JOIN crtm_stops s ON s.dataset_id=l.feed_id AND s.external_id=l.stop_id WHERE l.place_id=ANY(${emt}::uuid[]) AND l.feed_id='emt' AND ST_DWithin(p.location,ST_SetSRID(ST_MakePoint(s.longitude,s.latitude),4326)::geography,100)`
      : [];
    for (const p of places) {
      const renfe = p.identifiers.find((i) => i.source === "renfe");
      const link = links.find((l) => l.place_id === p.id);
      refs.set(
        p.id,
        renfe
          ? {
              feed: "renfe",
              version: renfe.sourceVersion ?? null,
              entity: "stop",
              externalId: renfe.externalId,
            }
          : link
            ? {
                feed: link.feed_id,
                version: link.static_version,
                entity: "stop",
                externalId: link.stop_id,
              }
            : {
                feed: "unknown",
                version: null,
                entity: "stop",
                externalId: p.id,
              },
      );
    }
    const data = await readAccessibility([...refs.values()], sql);
    return new Map(
      [...refs].map(([id, ref]) => [id, accessibilityFrom(data, ref)]),
    );
  } catch {
    return new Map(
      places.map((p) => [
        p.id,
        unknownAccessibility(
          { feed: "unknown", version: null, entity: "stop", externalId: p.id },
          "accessibility_storage_unavailable",
        ),
      ]),
    );
  }
}
type Leg = {
  mode: string;
  from: { stop?: { gtfsId: string } | null | undefined };
  to: { stop?: { gtfsId: string } | null | undefined };
  trip?: { gtfsId: string } | null | undefined;
};
export async function journeyAccessibility(
  routes: { legs: Leg[] }[],
  versions: Record<string, string>,
) {
  const ref = (
    id: string | undefined,
    entity: "stop" | "trip",
  ): AccessibilityRef => {
    const [feed, ...rest] = (id ?? "").split(":");
    return {
      feed: feed || "unknown",
      version: versions[feed ?? ""] ?? null,
      entity,
      externalId: rest.join(":"),
    };
  };
  const components = (l: Leg) => ({
    boarding: ref(l.from.stop?.gtfsId, "stop"),
    vehicle: ref(l.trip?.gtfsId, "trip"),
    alighting: ref(l.to.stop?.gtfsId, "stop"),
  });
  let data = new Map<string, AccessibilityDeclaration>();
  try {
    data = await readAccessibility(
      routes.flatMap((r) =>
        r.legs
          .filter((l) => l.mode !== "WALK")
          .flatMap((l) => Object.values(components(l))),
      ),
    );
  } catch {
    /* Route remains valid even when database initialization fails. */
  }
  const provenance: NonNullable<AccessibilityDeclaration["provenance"]>[] = [];
  const evidence: {
    id: string;
    declaration: Omit<AccessibilityDeclaration, "provenance">;
    provenanceRef: string | null;
  }[] = [];
  const ids = new Map<string, string>();
  const use = (r: AccessibilityRef) => {
    const key = accessibilityKey(r);
    const previous = ids.get(key);
    if (previous) return previous;
    const d = accessibilityFrom(data, r);
    let p: string | null = null;
    if (d.provenance) {
      let i = provenance.findIndex(
        (v) => JSON.stringify(v) === JSON.stringify(d.provenance),
      );
      if (i < 0) {
        i = provenance.length;
        provenance.push(d.provenance);
      }
      p = `s${i}`;
    }
    const { provenance: _p, ...declaration } = d;
    const id = `e${evidence.length}`;
    evidence.push({ id, declaration, provenanceRef: p });
    ids.set(key, id);
    return id;
  };
  const alternatives = routes.map((r, alternative) => ({
    alternative,
    legs: r.legs.map((l, leg) =>
      l.mode === "WALK"
        ? { leg, walking: "not_verified" as const }
        : {
            leg,
            ...Object.fromEntries(
              Object.entries(components(l)).map(([k, v]) => [k, use(v)]),
            ),
          },
    ),
  }));
  return {
    accessibilityGuaranteed: false as const,
    scope:
      "Static wheelchair declarations only; walking, internal transfers and current equipment operation are not verified.",
    provenance: provenance.map((p, i) => ({ id: `s${i}`, ...p })),
    evidence,
    alternatives,
    declaredBarriers: evidence
      .filter((e) => e.declaration.status === "declared_not_accessible")
      .map((e) => e.id),
    unknownComponents: evidence
      .filter((e) => e.declaration.status === "unknown")
      .map((e) => e.id),
    unverified: [
      "walking",
      "internal_connections_and_transfers",
      "current_equipment_operation",
    ],
  };
}
