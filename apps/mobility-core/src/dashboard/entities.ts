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
import { getFreshness, weatherFreshness } from "@mobility/provenance";
import type { z } from "zod";
import { parkingPrices, parkingPriceVersion } from "../catalogs/parking-prices";
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
export function projectDashboardEntity(
  row: Record<string, unknown>,
  category: z.infer<typeof dashboardEntityQuery>["category"],
  now = Date.now(),
): DashboardEntity {
  const e =
    row.entity && typeof row.entity === "object"
      ? (row.entity as Record<string, unknown>)
      : {};
  const staticData =
    category === "places" || String(row.product_id).startsWith("reference:");
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
    new Date(now),
  );
  const stationIdentity =
    e.stationIdentity && typeof e.stationIdentity === "object"
      ? (e.stationIdentity as Record<string, unknown>)
      : {};
  const location =
    e.location && typeof e.location === "object"
      ? (e.location as Record<string, unknown>)
      : {};
  const coordinate =
    e.coordinate && typeof e.coordinate === "object"
      ? (e.coordinate as Record<string, unknown>)
      : stationIdentity.location && typeof stationIdentity.location === "object"
        ? (stationIdentity.location as Record<string, unknown>)
        : location.start && typeof location.start === "object"
          ? (location.start as Record<string, unknown>)
          : {};
  const fields = new Set([
    "bikes",
    "docks",
    "availableBikes",
    "availableDocks",
    "capacity",
    "enabled",
    "freeSpaces",
    "installed",
    "renting",
    "returning",
    "detail",
    "road",
    "providerValidity",
    "startsAt",
    "endsAt",
    "free",
    "occupied",
    "total",
    "value",
    "vehiclesPerHour",
    "occupancyPercent",
    "loadPercent",
    "serviceLevel",
    "estimateSecondsAtObservation",
    "estimatedArrivalAt",
    "remainingSeconds",
    "distanceMeters",
    "vehicleId",
    "intensity",
    "occupancy",
    "speed",
    "line",
    "lineId",
    "destination",
    "description",
    "effect",
    "cause",
    "delay",
    "delaySeconds",
    "seconds",
    "expectedAt",
    "scheduledAt",
    "wheelchair",
    "publishedDate",
    "effectiveFrom",
    "maximumEur",
    "referenceYear",
    "route",
    "headsign",
    "arrivalSeconds",
    "departureSeconds",
    "calendarId",
    "kind",
    "basis",
    "period",
    "phenomenon",
    "severity",
    "level",
    "event",
    "messageType",
    "code",
    "category",
  ]);
  const measurements = Object.entries(e)
    .filter(
      ([k, v]) =>
        fields.has(k) &&
        (typeof v === "number" ||
          typeof v === "boolean" ||
          typeof v === "string"),
    )
    .slice(0, 64)
    .map(([name, value]) => ({
      name: name === "value" && typeof e.kind === "string" ? e.kind : name,
      value:
        typeof value === "string"
          ? value.slice(0, 2000)
          : (value as number | boolean),
      unit:
        name === "value" && typeof e.unit === "string"
          ? e.unit.slice(0, 40)
          : ((
              {
                bikes: "bicicletas",
                docks: "anclajes",
                freeSpaces: "plazas",
                vehiclesPerHour: "vehículos/h",
                occupancyPercent: "%",
                loadPercent: "%",
                estimateSecondsAtObservation: "s",
              } as Record<string, string>
            )[name] ?? null),
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
          ...(typeof m.periodMinutes === "number"
            ? {
                periodMinutes: m.periodMinutes,
                basis:
                  m.periodMinutes > 0
                    ? ("interval" as const)
                    : ("instant" as const),
              }
            : {}),
        });
    }
  return dashboardEntity.parse({
    kind: staticData
      ? "catalog"
      : forecast
        ? product === "weather:warnings:28"
          ? "notice"
          : "forecast"
        : (
            {
              departures: "arrival",
              incidents: "notice",
              bikes: "bike",
              environment: "observation",
              traffic: "traffic",
              parking: "parking",
            } as const
          )[category as Exclude<typeof category, "places">],
    id: String(row.entity_id),
    category,
    name:
      typeof stationIdentity.name === "string" && typeof e.name === "string"
        ? `${stationIdentity.name} · ${e.name}`
        : typeof e.name === "string"
          ? e.name.slice(0, 300)
          : typeof e.title === "string"
            ? e.title.slice(0, 300)
            : "Sin nombre publicado",
    latitude:
      typeof e.latitude === "number"
        ? e.latitude
        : typeof coordinate.latitude === "number"
          ? coordinate.latitude
          : null,
    longitude:
      typeof e.longitude === "number"
        ? e.longitude
        : typeof coordinate.longitude === "number"
          ? coordinate.longitude
          : null,
    evidence: {
      sourceId: source,
      productId: product,
      version: String(row.version),
      observedAt,
      ingestedAt,
      checkedAt,
      issuedAt: e._daily === true ? null : iso(row.issued_at),
      ageBasis: e._daily === true ? iso(row.issued_at) : null,
      issuedAtRaw: typeof e.issuedAtRaw === "string" ? e.issuedAtRaw : null,
      validFrom: iso(e.validFrom) ?? iso(row.valid_from),
      validTo: iso(e.validTo) ?? iso(row.valid_to),
      freshness: staticData
        ? "static"
        : forecast
          ? iso(row.valid_to) && Date.parse(String(row.valid_to)) < now
            ? "unavailable"
            : weatherFreshness(
                product === "weather:warnings:28" ? "warnings" : "forecast",
                checkedAt,
                iso(row.issued_at),
                typeof e._errorCode === "string" ? e._errorCode : null,
                now,
              )
          : fresh.status === "fresh"
            ? "recent"
            : fresh.status,
      freshnessBase: basis,
      ageSeconds: fresh.ageSeconds,
      thresholdSeconds: threshold,
      reason: staticData
        ? null
        : forecast
          ? iso(row.valid_to) && Date.parse(String(row.valid_to)) < now
            ? "outside_horizon"
            : typeof e._errorCode === "string"
              ? "last_refresh_failed"
              : iso(row.issued_at) &&
                  now - Date.parse(String(row.issued_at)) > 86400000 &&
                  product !== "weather:warnings:28"
                ? "old_issue"
                : (fresh.reason ?? null)
          : (fresh.reason ?? null),
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
    section: input.section ?? null,
    product: input.product ?? null,
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
      await tx`SET LOCAL statement_timeout='3s'`;
      await tx`SET LOCAL lock_timeout='100ms'`;
      const versions = await tx`WITH revisions AS (
        SELECT 'snapshot:'||job_id AS id,ingested_at::text AS version FROM mobility_snapshot
        UNION ALL SELECT 'static:'||source_id,version FROM static_feed
        UNION ALL SELECT 'crtm:'||dataset_id,version FROM crtm_feed
        UNION ALL SELECT 'emt:catalog',version FROM emt_catalog
        UNION ALL SELECT 'weather',md5(coalesce(string_agg(resource||':'||coalesce(version,'missing')||':'||coalesce(checked_at::text,'')||':'||coalesce(error_code,''),'|' ORDER BY resource),'missing')) FROM weather_product
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
      const tariffs = tx.json(
        parkingPrices.tariffs.map((t) => ({
          id: t.id,
          name: `Tarifa documental ${t.id}`,
          publishedDate: t.checkedAt,
          effectiveFrom: t.effectiveFrom,
          maximumEur: t.maximum.amountCents / 100,
          referenceYear: t.referenceYear,
          description: t.conditions.join(" · ").slice(0, 2000),
        })),
      );
      const thresholds = tx.json(
        Object.fromEntries(
          Object.entries(jobPolicies).map(([id, p]) => [id, p.maxAge]),
        ),
      );
      // JSON expansion occurs in PostgreSQL with filters, stable ordering and LIMIT.
      const rows = await tx`WITH entries AS (
      SELECT 'catalog:'||i.source_id AS product_id,i.source_id,p.id::text AS entity_id,coalesce(f.version,i.source_version,'unversioned') AS version,p.updated_at AS ingested_at,NULL::timestamptz AS checked_at,NULL::timestamptz AS issued_at,(f.service_start::timestamp AT TIME ZONE 'Europe/Madrid') AS valid_from,((f.service_end::date+1)::timestamp AT TIME ZONE 'Europe/Madrid') AS valid_to,'unknown'::text AS quality,
        jsonb_build_object('name',p.name,'kind',p.kind,'latitude',ST_Y(p.location::geometry),'longitude',ST_X(p.location::geometry),'wheelchair',i.wheelchair_code,'description',CASE WHEN ${input.product ?? null}='reference:accessibility' THEN 'Declaración estática de la fuente; no verifica equipamiento actual, recorridos interiores ni accesibilidad completa del viaje.' ELSE NULL END) AS entity
        FROM canonical_place p JOIN place_external_identifier i ON i.place_id=p.id LEFT JOIN static_feed f ON f.source_id=i.source_id
        WHERE ${input.category}='places' AND i.source_id<>'osm'
      UNION ALL SELECT 'crtm:'||s.dataset_id,'crtm',identity.id::text,f.version,f.imported_at,NULL::timestamptz,NULL::timestamptz,(f.service_start::timestamp AT TIME ZONE 'Europe/Madrid'),((f.service_end::date+1)::timestamp AT TIME ZONE 'Europe/Madrid'),'unknown'::text,jsonb_build_object('name',s.name,'latitude',s.latitude,'longitude',s.longitude,'wheelchair',s.wheelchair)
        FROM crtm_stops s JOIN crtm_stop_identity identity USING(dataset_id,external_id) JOIN crtm_feed f USING(dataset_id) WHERE ${input.category}='places'
      UNION ALL SELECT 'reference:lines',r.source_id,r.source_id||':'||r.external_id,f.version,f.imported_at,NULL::timestamptz,NULL::timestamptz,(f.service_start::timestamp AT TIME ZONE 'Europe/Madrid'),((f.service_end::date+1)::timestamp AT TIME ZONE 'Europe/Madrid'),'unknown'::text,jsonb_build_object('name',r.short_name||' · '||r.long_name,'route',r.short_name)
      FROM transit_route r JOIN static_feed f USING(source_id) WHERE ${input.category}='places' AND ${input.section ?? null}='reference' AND ${input.product ?? null}='reference:lines'
      UNION ALL SELECT 'reference:lines','crtm',r.dataset_id||':'||r.external_id,f.version,f.imported_at,NULL::timestamptz,NULL::timestamptz,(f.service_start::timestamp AT TIME ZONE 'Europe/Madrid'),((f.service_end::date+1)::timestamp AT TIME ZONE 'Europe/Madrid'),'unknown'::text,jsonb_build_object('name',coalesce(r.short_name,'')||' · '||coalesce(r.long_name,''),'route',r.short_name)
      FROM crtm_routes r JOIN crtm_feed f USING(dataset_id) WHERE ${input.category}='places' AND ${input.section ?? null}='reference' AND ${input.product ?? null}='reference:lines'
      UNION ALL SELECT 'reference:timetables','crtm',t.dataset_id||':'||t.trip_id||':'||t.sequence::text,f.version,f.imported_at,NULL::timestamptz,NULL::timestamptz,(f.service_start::timestamp AT TIME ZONE 'Europe/Madrid'),((f.service_end::date+1)::timestamp AT TIME ZONE 'Europe/Madrid'),'unknown'::text,jsonb_build_object('name',s.name||' · '||coalesce(r.short_name,'Horario'),'route',r.short_name,'headsign',trip.headsign,'arrivalSeconds',t.arrival_seconds,'departureSeconds',t.departure_seconds,'calendarId',trip.service_id,'description','Horario publicado: consultar calendario y excepciones; no es una llegada estimada.')
      FROM crtm_stop_times t JOIN crtm_stops s ON s.dataset_id=t.dataset_id AND s.external_id=t.stop_id JOIN crtm_trips trip ON trip.dataset_id=t.dataset_id AND trip.external_id=t.trip_id JOIN crtm_routes r ON r.dataset_id=trip.dataset_id AND r.external_id=trip.route_id JOIN crtm_feed f ON f.dataset_id=t.dataset_id WHERE ${input.category}='places' AND ${input.section ?? null}='reference' AND ${input.product ?? null}='reference:timetables'
      UNION ALL SELECT 'reference:tariffs','madrid-parking',t->>'id',${parkingPriceVersion},NULL::timestamptz,NULL::timestamptz,NULL::timestamptz,NULL::timestamptz,NULL::timestamptz,'unknown'::text,t
      FROM jsonb_array_elements(${tariffs}::jsonb) t WHERE ${input.section ?? null}='reference' AND ${input.product ?? null}='reference:tariffs'
      UNION ALL SELECT 'reference:geography','aemet',code,source_version,imported_at,NULL::timestamptz,NULL::timestamptz,NULL::timestamptz,NULL::timestamptz,'unknown'::text,jsonb_build_object('name',name,'latitude',ST_Y(ST_Centroid(boundary)),'longitude',ST_X(ST_Centroid(boundary)),'description','Municipio instalado para resolver productos meteorológicos; el centroide no es una estación de observación.')
      FROM weather_municipality WHERE ${input.section ?? null}='reference' AND ${input.product ?? null}='reference:geography'
      UNION ALL SELECT m.job_id,m.source_id,coalesce(item.value->>'id',(item.value->>'stationId')||CASE WHEN m.job_id='madrid-air' THEN ':'||coalesce(item.value->>'name',item.value->>'pollutant','unknown') ELSE '' END,'row-'||item.ordinality::text)||CASE WHEN m.job_id='madrid-parking' THEN ':'||coalesce(sample.value->>'category','unknown') ELSE '' END,m.ingested_at::text,m.ingested_at,NULL::timestamptz,NULL::timestamptz,NULL::timestamptz,NULL::timestamptz,m.quality,item.value||sample.value||CASE WHEN m.job_id IN ('renfe-alerts','emt-alerts','dgt-incidents','madrid-traffic') THEN jsonb_build_object('observedAt',m.observed_at) ELSE '{}'::jsonb END||CASE WHEN m.job_id='madrid-parking' THEN jsonb_build_object('name',(item.value->>'name')||coalesce(' · '||(sample.value->>'name'),'')) ELSE '{}'::jsonb END
        FROM mobility_snapshot m CROSS JOIN LATERAL jsonb_array_elements(coalesce(m.payload->'stations',m.payload->'readings',m.payload->'sensors',m.payload->'parkings',m.payload->'incidents',m.payload->'alerts',m.payload->'updates','[]'::jsonb)) WITH ORDINALITY item(value,ordinality)
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN m.job_id='madrid-parking' AND jsonb_array_length(coalesce(item.value->'availability','[]'::jsonb))>0 THEN item.value->'availability' ELSE '[{}]'::jsonb END) WITH ORDINALITY sample(value,ordinality)
        WHERE m.job_id=ANY(${[...jobs]}::text[])
      UNION ALL SELECT 'emt:arrivals','emt',c.stop_id||':'||item.ordinality::text,c.ingested_at::text,c.ingested_at,NULL::timestamptz,NULL::timestamptz,NULL::timestamptz,NULL::timestamptz,'provisional'::text,
        item.value||jsonb_build_object('name',coalesce(item.value->>'destination','Llegada EMT'),'observedAt',c.observed_at)
        FROM emt_arrival_cache c CROSS JOIN LATERAL jsonb_array_elements(coalesce(c.payload,'[]'::jsonb)) WITH ORDINALITY item(value,ordinality)
        WHERE ${input.category}='departures'
      UNION ALL SELECT 'weather:'||w.resource,'aemet',w.resource||':'||item.ordinality::text,coalesce(w.version,'missing'),w.fetched_at,w.checked_at,w.issued_at,w.valid_from,w.valid_to,'provisional'::text,
        item.value||jsonb_build_object('name',coalesce(w.payload->>'name',item.value->>'event','Aviso AEMET'),'_errorCode',w.error_code,'_daily',w.payload->>'product'='daily_forecast','issuedAtRaw',w.payload->>'issuedAtRaw')
        FROM weather_product w CROSS JOIN LATERAL jsonb_array_elements(coalesce(w.payload->'periods',w.payload->'records','[]'::jsonb)) WITH ORDINALITY item(value,ordinality)
        WHERE (${input.category}='environment' AND w.resource<>'warnings:28') OR (${input.category}='incidents' AND w.resource='warnings:28')
      ), selected AS (SELECT DISTINCT ON(product_id,entity_id) *, product_id||':'||entity_id AS key FROM entries WHERE
        (${input.section ?? null}::text IS NULL OR (${input.section ?? null}='reference' AND (product_id LIKE 'catalog:%' OR product_id LIKE 'crtm:%' OR product_id LIKE 'reference:%')) OR (${input.section ?? null}='dynamic' AND ${input.category}<>'places'))
        AND (${input.product ?? null}::text IS NULL OR product_id=${input.product ?? null} OR (${input.product ?? null}='reference:places' AND (product_id LIKE 'catalog:%' OR product_id LIKE 'crtm:%')) OR (${input.product ?? null}='reference:accessibility' AND (product_id LIKE 'crtm:%' OR product_id='catalog:renfe')) OR (${input.product ?? null}='weather:forecast' AND product_id LIKE 'weather:forecast:%') OR (${input.product ?? null}='weather:daily' AND product_id LIKE 'weather:daily:%') OR (${input.product ?? null}='weather:warnings' AND product_id='weather:warnings:28'))
        AND (${input.source ?? null}::text IS NULL OR source_id=${input.source ?? null})
        AND (${input.search ?? null}::text IS NULL OR coalesce(entity->>'name',entity->>'title','') ILIKE '%'||${input.search ?? null}||'%')
        AND (${detailId ?? null}::text IS NULL OR entity_id=${detailId ?? null})
        ORDER BY product_id,entity_id)
      , classified AS (SELECT *, CASE WHEN ${input.category}='places' THEN 'static' WHEN product_id LIKE 'weather:%' THEN CASE WHEN checked_at IS NULL OR issued_at IS NULL OR valid_to<now() OR checked_at>now()+interval '30 seconds' OR issued_at>now()+interval '5 minutes' OR checked_at<now()-interval '24 hours' OR (product_id<>'weather:warnings:28' AND issued_at<now()-interval '24 hours') THEN 'unavailable' WHEN entity->>'_errorCode' IS NULL AND now()-checked_at<=CASE WHEN product_id='weather:warnings:28' THEN interval '300 seconds' ELSE interval '1800 seconds' END THEN 'recently_checked' ELSE 'stale' END WHEN entity->>'observedAt' IS NULL THEN 'unavailable' WHEN (entity->>'observedAt')::timestamptz>now()+interval '30 seconds' THEN 'unavailable' WHEN now()-(entity->>'observedAt')::timestamptz <= (coalesce((${thresholds}::jsonb->>product_id)::int,CASE WHEN product_id='emt:arrivals' THEN 30 ELSE 0 END))*interval '1 second' THEN 'recent' ELSE 'stale' END AS state FROM selected)
      , filtered AS (SELECT * FROM classified WHERE (${bbox !== null}=false OR ((entity->>'longitude')::float8 BETWEEN ${bbox?.[0] ?? -180} AND ${bbox?.[2] ?? 180} AND (entity->>'latitude')::float8 BETWEEN ${bbox?.[1] ?? -90} AND ${bbox?.[3] ?? 90}))
        AND (${input.freshness ?? null}::text IS NULL OR state=${input.freshness ?? null})
      ), stats AS (SELECT count(*)::int AS total, count(*) FILTER(WHERE state IN ('recent','recently_checked'))::int AS recent,count(*) FILTER(WHERE state='stale')::int AS stale,count(*) FILTER(WHERE state='static')::int AS static,count(*) FILTER(WHERE state IN ('unavailable','unknown'))::int AS unavailable,now() AS evaluated_at FROM filtered)
      SELECT page.*,stats.total AS selection_total,stats.recent AS selection_recent,stats.stale AS selection_stale,stats.static AS selection_static,stats.unavailable AS selection_unavailable,stats.evaluated_at FROM stats LEFT JOIN LATERAL (SELECT * FROM filtered WHERE key>${after} ORDER BY product_id,entity_id LIMIT ${limit + 1}) page ON true`;
      const totals = {
        total: Number(rows[0]?.selection_total ?? 0),
        recent: Number(rows[0]?.selection_recent ?? 0),
        stale: Number(rows[0]?.selection_stale ?? 0),
        static: Number(rows[0]?.selection_static ?? 0),
        unavailable: Number(rows[0]?.selection_unavailable ?? 0),
        unit:
          input.category === "places"
            ? "lugares de referencia"
            : input.category === "environment"
              ? "medidas o periodos"
              : "registros del producto",
        evaluatedAt: iso(rows[0]?.evaluated_at) ?? new Date().toISOString(),
      };
      const entityRows = rows.filter((r) => r.entity_id != null);
      const result: DashboardEntity[] = [];
      for (const row of entityRows.slice(0, limit)) {
        const entity = projectDashboardEntity(
          row,
          input.category,
          Date.parse(totals.evaluatedAt),
        );
        if (
          Buffer.byteLength(JSON.stringify([...result, entity])) >
          (map ? 900000 : 240000)
        )
          break;
        result.push(entity);
      }
      const last = entityRows[result.length - 1];
      const limited = entityRows.length > result.length;
      if (map)
        return dashboardMapPage.parse({
          schemaVersion: 1,
          readAt: new Date().toISOString(),
          entities: result,
          totals,
          revisions,
          limited,
          countScope: "returned_viewport",
        });
      return dashboardEntityPage.parse({
        schemaVersion: 1,
        readAt: new Date().toISOString(),
        entities: result,
        totals,
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
