import { createHash } from "node:crypto";
import {
  type DashboardEntity,
  dashboardEntity,
  dashboardEntityPage,
  dashboardEntityQuery,
  dashboardMapPage,
  dashboardMapQuery,
} from "@mobility/contracts";
import { type JobId, jobPolicies } from "@mobility/domain";
import { getFreshness } from "@mobility/provenance";
import type { z } from "zod";
import { database } from "../database";
import { DashboardAccessError } from "./access";
import { decodeCursor, encodeCursor } from "./cursor";

const iso = (v: unknown) =>
  v instanceof Date
    ? v.toISOString()
    : typeof v === "string" && Number.isFinite(Date.parse(v))
      ? new Date(v).toISOString()
      : null;
const products = {
  departures: ["renfe-trips"],
  incidents: ["renfe-alerts", "emt-alerts", "dgt-incidents"],
  bikes: ["bicimad"],
  environment: ["madrid-air", "aemet"],
  traffic: ["madrid-traffic"],
  parking: ["madrid-parking"],
} as const;
function project(
  row: Record<string, unknown>,
  category: z.infer<typeof dashboardEntityQuery>["category"],
): DashboardEntity {
  const e =
    row.entity && typeof row.entity === "object"
      ? (row.entity as Record<string, unknown>)
      : {};
  const staticData = category === "places";
  const observedAt = staticData ? null : iso(e.observedAt);
  const entityProvenance =
    e.provenance && typeof e.provenance === "object"
      ? (e.provenance as Record<string, unknown>)
      : {};
  const ingestedAt = iso(entityProvenance.ingestedAt) ?? iso(row.ingested_at);
  const source = String(row.source_id);
  const product = String(row.product_id);
  const forecast = product.startsWith("weather:");
  const threshold = forecast
    ? product === "weather:warnings:28"
      ? 300
      : 1800
    : product === "emt:arrivals"
      ? 30
      : product in jobPolicies
        ? jobPolicies[product as JobId].maxAge
        : null;
  const checkedAt = iso(row.checked_at);
  const basis = forecast ? checkedAt : observedAt;
  const fresh = getFreshness(
    basis && ingestedAt
      ? {
          source: source as "renfe",
          observedAt: basis,
          ingestedAt,
          quality:
            row.quality === "validated"
              ? "validated"
              : row.quality === "unknown"
                ? "unknown"
                : "provisional",
        }
      : null,
    threshold ?? 0,
  );
  const measurements = Object.entries(e)
    .filter(
      ([k, v]) =>
        ![
          "id",
          "name",
          "latitude",
          "longitude",
          "observedAt",
          "rawReference",
        ].includes(k) &&
        (typeof v === "number" || typeof v === "boolean"),
    )
    .slice(0, 64)
    .map(([name, value]) => ({
      name,
      value: value as number | boolean,
      unit:
        name === "value" && typeof e.unit === "string"
          ? e.unit.slice(0, 40)
          : null,
    }));
  if (Array.isArray(e.measurements))
    for (const m of e.measurements.slice(0, 64)) {
      if (
        m &&
        typeof m === "object" &&
        typeof m.name === "string" &&
        typeof m.value === "number" &&
        Number.isFinite(m.value)
      )
        measurements.push({
          name: m.name.slice(0, 100),
          value: m.value,
          unit: typeof m.unit === "string" ? m.unit.slice(0, 40) : null,
        });
    }
  return dashboardEntity.parse({
    id: String(row.entity_id),
    category,
    name:
      typeof e.name === "string"
        ? e.name.slice(0, 300)
        : typeof e.title === "string"
          ? e.title.slice(0, 300)
          : "Sin nombre publicado",
    latitude: typeof e.latitude === "number" ? e.latitude : null,
    longitude: typeof e.longitude === "number" ? e.longitude : null,
    evidence: {
      sourceId: source,
      productId: product,
      version: String(row.version),
      observedAt,
      ingestedAt,
      checkedAt,
      issuedAt: iso(row.issued_at),
      issuedAtRaw: typeof e.issuedAtRaw === "string" ? e.issuedAtRaw : null,
      validFrom: iso(row.valid_from),
      validTo: iso(row.valid_to),
      freshness:
        forecast &&
        iso(row.valid_to) &&
        Date.parse(String(row.valid_to)) < Date.now()
          ? "unavailable"
          : staticData
            ? "static"
            : fresh.status === "fresh"
              ? forecast
                ? "recently_checked"
                : "recent"
              : fresh.status,
      freshnessBase: basis,
      ageSeconds: fresh.ageSeconds,
      thresholdSeconds: threshold,
      reason: staticData ? null : (fresh.reason ?? null),
      quality:
        row.quality === "validated"
          ? "validated"
          : row.quality === "unknown"
            ? "unknown"
            : "provisional",
      coverage: basis || staticData ? "partial" : "unknown",
    },
    measurements: measurements.slice(0, 64),
    truncated: false,
  });
}
export async function readEntities(
  value: unknown,
  owner: string,
  map = false,
  detailId?: string,
) {
  const input = map
    ? dashboardMapQuery.parse(value)
    : dashboardEntityQuery.parse(value);
  const limit = map ? 1000 : "limit" in input ? input.limit : 50;
  const selection = JSON.stringify({
    category: input.category,
    source: input.source ?? null,
    freshness: input.freshness ?? null,
    search: input.search ?? null,
    bbox: "bbox" in input ? input.bbox : null,
  });
  const cursor =
    "cursor" in input && input.cursor ? decodeCursor(input.cursor) : null;
  if (cursor && (cursor.owner !== owner || cursor.selection !== selection))
    throw new DashboardAccessError(400, "invalid_cursor");
  return database().begin(
    "isolation level repeatable read read only",
    async (tx) => {
      const versions = await tx`WITH revisions AS (
        SELECT 'snapshot:'||job_id AS id,ingested_at::text AS version FROM mobility_snapshot
        UNION ALL SELECT 'static:'||source_id,version FROM static_feed
        UNION ALL SELECT 'crtm:'||dataset_id,version FROM crtm_feed
        UNION ALL SELECT 'emt:catalog',version FROM emt_catalog
        UNION ALL SELECT 'weather',md5(coalesce(string_agg(resource||':'||coalesce(version,'missing'),'|' ORDER BY resource),'missing')) FROM weather_product
        UNION ALL SELECT 'emt:arrivals',md5(coalesce(string_agg(stop_id||':'||coalesce(ingested_at::text,'missing'),'|' ORDER BY stop_id),'missing')) FROM emt_arrival_cache)
        SELECT * FROM revisions ORDER BY id`;
      const revisions = Object.fromEntries(
        versions.map((r) => [String(r.id), String(r.version)]),
      );
      const vector = createHash("sha256")
        .update(JSON.stringify(revisions))
        .digest("hex");
      if (cursor && cursor.vector !== vector)
        throw new DashboardAccessError(409, "snapshot_changed");
      const after = cursor ? String(cursor.after ?? "") : "";
      const jobs: readonly string[] =
        input.category === "places" ? [] : products[input.category];
      const bbox = "bbox" in input ? input.bbox : null;
      const thresholds = JSON.stringify(
        Object.fromEntries(
          Object.entries(jobPolicies).map(([id, p]) => [id, p.maxAge]),
        ),
      );
      // JSON expansion occurs in PostgreSQL with filters, stable ordering and LIMIT.
      const rows = await tx`WITH entries AS (
      SELECT 'catalog:'||i.source_id AS product_id,i.source_id,p.id::text AS entity_id,coalesce(f.version,i.source_version,'unversioned') AS version,p.updated_at AS ingested_at,NULL::timestamptz AS checked_at,NULL::timestamptz AS issued_at,(f.service_start::timestamp AT TIME ZONE 'Europe/Madrid') AS valid_from,((f.service_end::date+1)::timestamp AT TIME ZONE 'Europe/Madrid') AS valid_to,'unknown'::text AS quality,
        jsonb_build_object('name',p.name,'kind',p.kind,'latitude',ST_Y(p.location::geometry),'longitude',ST_X(p.location::geometry)) AS entity
        FROM canonical_place p JOIN place_external_identifier i ON i.place_id=p.id LEFT JOIN static_feed f ON f.source_id=i.source_id
        WHERE ${input.category}='places' AND i.source_id<>'osm'
      UNION ALL SELECT 'crtm:'||s.dataset_id,'crtm',identity.id::text,f.version,f.imported_at,NULL::timestamptz,NULL::timestamptz,(f.service_start::timestamp AT TIME ZONE 'Europe/Madrid'),((f.service_end::date+1)::timestamp AT TIME ZONE 'Europe/Madrid'),'unknown'::text,jsonb_build_object('name',s.name,'latitude',s.latitude,'longitude',s.longitude,'wheelchair',s.wheelchair)
        FROM crtm_stops s JOIN crtm_stop_identity identity USING(dataset_id,external_id) JOIN crtm_feed f USING(dataset_id) WHERE ${input.category}='places'
      UNION ALL SELECT m.job_id,m.source_id,coalesce(item.value->>'id',(item.value->>'stationId')||':'||coalesce(item.value->>'pollutant','reading-'||item.ordinality::text),'row-'||item.ordinality::text)||CASE WHEN m.job_id='madrid-parking' THEN ':'||sample.ordinality::text ELSE '' END,m.ingested_at::text,m.ingested_at,NULL::timestamptz,NULL::timestamptz,NULL::timestamptz,NULL::timestamptz,m.quality,item.value||sample.value||CASE WHEN m.job_id='madrid-parking' THEN jsonb_build_object('name',(item.value->>'name')||coalesce(' · '||(sample.value->>'name'),'')) ELSE '{}'::jsonb END
        FROM mobility_snapshot m CROSS JOIN LATERAL jsonb_array_elements(coalesce(m.payload->'stations',m.payload->'readings',m.payload->'sensors',m.payload->'parkings',m.payload->'incidents',m.payload->'alerts',m.payload->'updates','[]'::jsonb)) WITH ORDINALITY item(value,ordinality)
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN m.job_id='madrid-parking' AND jsonb_array_length(coalesce(item.value->'availability','[]'::jsonb))>0 THEN item.value->'availability' ELSE '[{}]'::jsonb END) WITH ORDINALITY sample(value,ordinality)
        WHERE m.job_id=ANY(${[...jobs]}::text[])
      UNION ALL SELECT 'emt:arrivals','emt',c.stop_id||':'||item.ordinality::text,c.ingested_at::text,c.ingested_at,NULL::timestamptz,NULL::timestamptz,NULL::timestamptz,NULL::timestamptz,'provisional'::text,
        item.value||jsonb_build_object('name',coalesce(item.value->>'destination','Llegada EMT'),'observedAt',c.observed_at)
        FROM emt_arrival_cache c CROSS JOIN LATERAL jsonb_array_elements(coalesce(c.payload,'[]'::jsonb)) WITH ORDINALITY item(value,ordinality)
        WHERE ${input.category}='departures'
      UNION ALL SELECT 'weather:'||w.resource,'aemet',w.resource||':'||item.ordinality::text,coalesce(w.version,'missing'),w.fetched_at,w.checked_at,w.issued_at,w.valid_from,w.valid_to,'provisional'::text,
        item.value||jsonb_build_object('name',coalesce(w.payload->>'name',item.value->>'event','Aviso AEMET'))
        FROM weather_product w CROSS JOIN LATERAL jsonb_array_elements(coalesce(w.payload->'periods',w.payload->'records','[]'::jsonb)) WITH ORDINALITY item(value,ordinality)
        WHERE (${input.category}='environment' AND w.resource<>'warnings:28') OR (${input.category}='incidents' AND w.resource='warnings:28')
      ), selected AS (SELECT DISTINCT ON(product_id,entity_id) *, product_id||':'||entity_id AS key FROM entries WHERE
        (${input.source ?? null}::text IS NULL OR source_id=${input.source ?? null})
        AND (${input.search ?? null}::text IS NULL OR coalesce(entity->>'name',entity->>'title','') ILIKE '%'||${input.search ?? null}||'%')
        AND (${detailId ?? null}::text IS NULL OR entity_id=${detailId ?? null})
        ORDER BY product_id,entity_id)
      SELECT * FROM selected WHERE key>${after}
        AND (${bbox !== null}=false OR ((entity->>'longitude')::float8 BETWEEN ${bbox?.[0] ?? -180} AND ${bbox?.[2] ?? 180} AND (entity->>'latitude')::float8 BETWEEN ${bbox?.[1] ?? -90} AND ${bbox?.[3] ?? 90}))
        AND (${input.freshness ?? null}::text IS NULL OR CASE WHEN ${input.category}='places' THEN 'static' WHEN product_id LIKE 'weather:%' THEN CASE WHEN checked_at IS NULL OR valid_to<now() OR checked_at>now()+interval '30 seconds' THEN 'unavailable' WHEN now()-checked_at<=CASE WHEN product_id='weather:warnings:28' THEN interval '300 seconds' ELSE interval '1800 seconds' END THEN 'recently_checked' ELSE 'stale' END WHEN entity->>'observedAt' IS NULL THEN 'unavailable' WHEN (entity->>'observedAt')::timestamptz>now()+interval '30 seconds' THEN 'unavailable' WHEN now()-(entity->>'observedAt')::timestamptz <= (coalesce((${thresholds}::jsonb->>product_id)::int,CASE WHEN product_id='emt:arrivals' THEN 30 ELSE 0 END))*interval '1 second' THEN 'recent' ELSE 'stale' END=${input.freshness ?? null})
      ORDER BY product_id,entity_id LIMIT ${limit + 1}`;
      const result: DashboardEntity[] = [];
      for (const row of rows.slice(0, limit)) {
        const entity = project(row, input.category);
        if (
          Buffer.byteLength(JSON.stringify([...result, entity])) >
          (map ? 900000 : 240000)
        )
          break;
        result.push(entity);
      }
      const last = rows[result.length - 1];
      const limited = rows.length > result.length;
      if (map)
        return dashboardMapPage.parse({
          schemaVersion: 1,
          readAt: new Date().toISOString(),
          entities: result,
          revisions,
          limited,
          countScope: "returned_viewport",
        });
      return dashboardEntityPage.parse({
        schemaVersion: 1,
        readAt: new Date().toISOString(),
        entities: result,
        revisions,
        limited,
        countScope: "returned_page",
        nextCursor:
          limited && last
            ? encodeCursor({
                owner,
                selection,
                vector,
                after: String(last.key),
              })
            : null,
      });
    },
  );
}
