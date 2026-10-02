import {
  type DashboardMetric,
  dashboardOverview,
  dashboardWindow,
  sourceIdSchema,
} from "@mobility/contracts";
import { jobPolicies } from "@mobility/domain";
import { getFreshness } from "@mobility/provenance";
import { database } from "../database";
import { DashboardAccessError } from "./access";
import { readActivityChart } from "./activity-chart";
import { presentationProducts } from "./products";

const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
export async function readOverview(params: URLSearchParams) {
  const window = dashboardWindow.parse(params.get("window") ?? "24h");
  const evaluatedAt = new Date().toISOString(),
    now = Date.parse(evaluatedAt);
  const from = new Date(
    now - { "1h": 3600000, "24h": 86400000, "7d": 604800000 }[window],
  ).toISOString();
  const sql = database();
  const [data, activity] = await Promise.all([
    sql.begin("isolation level repeatable read read only", async (tx) => {
      await tx`SET LOCAL statement_timeout='3s'`;
      const products =
        await tx`SELECT j.id,j.source_id,s.enabled,j.error_code,m.observed_at,m.ingested_at,m.quality,
      CASE WHEN m.payload IS NULL THEN NULL ELSE coalesce(jsonb_array_length(m.payload->'stations'),jsonb_array_length(m.payload->'readings'),jsonb_array_length(m.payload->'sensors'),jsonb_array_length(m.payload->'parkings'),jsonb_array_length(m.payload->'incidents'),jsonb_array_length(m.payload->'alerts'),jsonb_array_length(m.payload->'updates'),0) END AS total
      FROM ingestion_job j JOIN source_catalog s ON s.id=j.source_id LEFT JOIN mobility_snapshot m ON m.job_id=j.id`;
      const ages = tx.json(
        Object.fromEntries(
          Object.entries(jobPolicies).map(([id, p]) => [id, p.maxAge]),
        ),
      );
      const distributions = await tx`WITH entities AS (
        SELECT m.job_id,CASE WHEN m.job_id IN ('renfe-alerts','emt-alerts','dgt-incidents','madrid-traffic') THEN m.observed_at ELSE coalesce((sample.value->>'observedAt')::timestamptz,(e.value->>'observedAt')::timestamptz) END AS at
        FROM mobility_snapshot m CROSS JOIN LATERAL jsonb_array_elements(coalesce(m.payload->'stations',m.payload->'readings',m.payload->'sensors',m.payload->'parkings',m.payload->'incidents',m.payload->'alerts',m.payload->'updates','[]'::jsonb)) e(value) CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN m.job_id='madrid-parking' THEN coalesce(e.value->'availability','[]'::jsonb) ELSE '[{}]'::jsonb END) sample(value))
        SELECT job_id,count(*)::int AS total,count(*) FILTER(WHERE at BETWEEN ${evaluatedAt}::timestamptz-(((${ages}::jsonb->>job_id)::int)*interval '1 second') AND ${evaluatedAt}::timestamptz+interval '30 seconds')::int AS recent,count(*) FILTER(WHERE at<${evaluatedAt}::timestamptz-(((${ages}::jsonb->>job_id)::int)*interval '1 second'))::int AS stale,count(*) FILTER(WHERE at IS NULL OR at>${evaluatedAt}::timestamptz+interval '30 seconds')::int AS unavailable FROM entities GROUP BY job_id`;
      const bikes =
        await tx`WITH stations AS (SELECT DISTINCT ON(e->>'id') e FROM mobility_snapshot m CROSS JOIN LATERAL jsonb_array_elements(m.payload->'stations') e WHERE job_id='bicimad' AND EXISTS(SELECT 1 FROM source_catalog WHERE id='bicimad' AND enabled) ORDER BY e->>'id',(e->>'observedAt') DESC), eligible AS (SELECT e FROM stations WHERE e->>'installed'='true' AND e->>'renting'='true' AND (e->>'observedAt')::timestamptz BETWEEN ${evaluatedAt}::timestamptz-interval '60 seconds' AND ${evaluatedAt}::timestamptz+interval '30 seconds' AND (e->>'bikes')::int>=0)
      SELECT (SELECT count(*)::int FROM stations) AS denominator,count(*)::int AS included,sum((e->>'bikes')::int)::float8 AS value FROM eligible`;
      const categories =
        await tx`SELECT DISTINCT a->>'category' AS code,a->>'name' AS label FROM mobility_snapshot m CROSS JOIN LATERAL jsonb_array_elements(m.payload->'parkings') p CROSS JOIN LATERAL jsonb_array_elements(p->'availability') a WHERE job_id='madrid-parking' ORDER BY code,label LIMIT 100`;
      const code =
        params.get("parkingCategory") ??
        (categories[0]?.code ? String(categories[0].code) : null);
      if (code && !categories.some((r) => r.code === code))
        throw new DashboardAccessError(400, "invalid_request");
      const parking =
        await tx`WITH samples AS (SELECT DISTINCT ON(p->>'id',a->>'category') p->>'id' AS id,a FROM mobility_snapshot m CROSS JOIN LATERAL jsonb_array_elements(m.payload->'parkings') p CROSS JOIN LATERAL jsonb_array_elements(p->'availability') a WHERE job_id='madrid-parking' AND EXISTS(SELECT 1 FROM source_catalog WHERE id='madrid-parking' AND enabled) AND a->>'category'=${code} ORDER BY p->>'id',a->>'category',(a->>'observedAt') DESC), eligible AS (SELECT * FROM samples WHERE (a->>'observedAt')::timestamptz BETWEEN ${evaluatedAt}::timestamptz-interval '300 seconds' AND ${evaluatedAt}::timestamptz+interval '30 seconds' AND (a->>'freeSpaces')::int>=0)
      SELECT (SELECT count(*)::int FROM samples) AS denominator,count(*)::int AS included,sum((a->>'freeSpaces')::int)::float8 AS value FROM eligible`;
      const demand =
        await tx`SELECT CASE WHEN resource='warnings:28' THEN 'weather:warnings' WHEN resource LIKE 'daily:%' THEN 'weather:daily' ELSE 'weather:forecast' END AS id,
      count(*)::int AS total, bool_or(checked_at IS NOT NULL AND issued_at IS NOT NULL AND checked_at<=${evaluatedAt}::timestamptz+interval '30 seconds' AND issued_at<=${evaluatedAt}::timestamptz+interval '5 minutes' AND checked_at>=${evaluatedAt}::timestamptz-interval '24 hours' AND (resource='warnings:28' OR issued_at>=${evaluatedAt}::timestamptz-interval '24 hours') AND valid_to>=${evaluatedAt}::timestamptz AND error_code IS NULL AND checked_at>=${evaluatedAt}::timestamptz-CASE WHEN resource='warnings:28' THEN interval '5 minutes' ELSE interval '30 minutes' END) AS usable,
      max(issued_at) AS observed_at,max(fetched_at) AS ingested_at FROM weather_product GROUP BY 1
      UNION ALL SELECT 'emt:arrivals',count(*)::int,bool_or(observed_at BETWEEN ${evaluatedAt}::timestamptz-interval '30 seconds' AND ${evaluatedAt}::timestamptz+interval '30 seconds'),max(observed_at),max(ingested_at) FROM emt_arrival_cache`;
      const sources = await tx`SELECT id,enabled FROM source_catalog`;
      const notices =
        await tx`WITH entries AS (SELECT m.job_id,a,m.observed_at,m.ingested_at FROM mobility_snapshot m CROSS JOIN LATERAL jsonb_array_elements(coalesce(m.payload->'alerts',m.payload->'incidents','[]'::jsonb)) a WHERE m.job_id IN ('renfe-alerts','emt-alerts','dgt-incidents') AND EXISTS(SELECT 1 FROM source_catalog WHERE id=m.source_id AND enabled)), eligible AS (
      SELECT job_id,a->>'id' AS id FROM entries WHERE observed_at BETWEEN ${evaluatedAt}::timestamptz-CASE WHEN job_id='renfe-alerts' THEN interval '90 seconds' WHEN job_id='emt-alerts' THEN interval '600 seconds' ELSE interval '180 seconds' END AND ${evaluatedAt}::timestamptz+interval '30 seconds' AND (
      (job_id='emt-alerts' AND (a->>'startsAt')::timestamptz<=${evaluatedAt}::timestamptz AND (a->>'endsAt')::timestamptz>=${evaluatedAt}::timestamptz)
      OR (job_id='dgt-incidents' AND a->>'complexValidity'='false' AND a->>'providerValidity'='active' AND (a->>'startsAt')::timestamptz<=${evaluatedAt}::timestamptz AND (a->>'endsAt')::timestamptz>=${evaluatedAt}::timestamptz)
      OR (job_id='renfe-alerts' AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(a->'activePeriods','[]'::jsonb)) p WHERE (p->>'start')::double precision<=extract(epoch FROM ${evaluatedAt}::timestamptz) AND (p->>'end')::double precision>=extract(epoch FROM ${evaluatedAt}::timestamptz))))
      UNION SELECT 'weather:warnings',a->>'id' FROM weather_product w CROSS JOIN LATERAL jsonb_array_elements(coalesce(w.payload->'records','[]'::jsonb)) a WHERE w.resource='warnings:28' AND checked_at BETWEEN ${evaluatedAt}::timestamptz-interval '5 minutes' AND ${evaluatedAt}::timestamptz+interval '30 seconds' AND issued_at IS NOT NULL AND issued_at<=${evaluatedAt}::timestamptz+interval '5 minutes' AND error_code IS NULL AND a->>'messageType'<>'Cancel' AND (a->>'validFrom')::timestamptz<=${evaluatedAt}::timestamptz AND (a->>'validTo')::timestamptz>=${evaluatedAt}::timestamptz AND EXISTS(SELECT 1 FROM source_catalog WHERE id='aemet' AND enabled))
      SELECT count(DISTINCT (job_id,id))::int AS value FROM eligible`;
      const recentEvents =
        await tx`SELECT id::text,event_type,outcome,source_id,occurred_at FROM operational_event WHERE expires_at>now() AND occurred_at>=${from}::timestamptz AND occurred_at<${evaluatedAt}::timestamptz ORDER BY occurred_at DESC,id DESC LIMIT 5`;
      return {
        recentEvents,
        distributions,
        demand,
        sources,
        notices: notices[0]?.value ?? null,
        products,
        bikes: bikes[0],
        parking: parking[0],
        code,
        categories,
      };
    }),
    readActivityChart(from, evaluatedAt),
  ]);
  const products = presentationProducts.map((p) => {
    const r = data.products.find((r) => r.id === p.id);
    const distribution = data.distributions.find((r) => r.job_id === p.id);
    const demand = data.demand.find((r) => r.id === p.id);
    const fresh = getFreshness(
      r?.observed_at && r.ingested_at
        ? {
            source: sourceIdSchema.parse(p.source),
            observedAt: iso(r.observed_at) as string,
            ingestedAt: iso(r.ingested_at) as string,
            quality: r.quality ?? "unknown",
          }
        : null,
      p.maxAge,
      new Date(now),
    );
    const total = distribution
      ? Number(distribution.total)
      : r?.total == null
        ? demand?.total != null
          ? Number(demand.total)
          : null
        : Number(r.total);
    return {
      id: p.id,
      label: p.label,
      source: p.source,
      category: p.category,
      mode: p.mode,
      enabled: Boolean(data.sources.find((s) => s.id === p.source)?.enabled),
      usable: demand
        ? Boolean(demand.usable)
        : distribution
          ? Number(distribution.recent) > 0
          : total === 0 && fresh.status === "fresh",
      total,
      recent: distribution?.recent ?? null,
      stale: distribution?.stale ?? null,
      unavailable: distribution?.unavailable ?? null,
      unit:
        p.mode === "demand"
          ? "recursos consultados"
          : p.category === "parking"
            ? "muestras por categoría"
            : p.category === "environment"
              ? "medidas"
              : p.category === "bikes"
                ? "estaciones"
                : "registros",
      observedAt: iso(r?.observed_at ?? demand?.observed_at),
      ingestedAt: iso(r?.ingested_at ?? demand?.ingested_at),
      issue: r?.error_code
        ? "El último intento de actualización falló; la lectura guardada conserva su fecha."
        : !r && !demand && p.mode === "demand"
          ? "Sin consulta previa guardada. Consulta un lugar concreto desde Consultas."
          : total === null
            ? "Sin lectura guardada."
            : !(demand ? demand.usable : fresh.status === "fresh")
              ? "La última lectura no describe necesariamente el estado actual."
              : null,
    };
  });
  const metric = (
    id: string,
    label: string,
    value: number | null,
    unit: string,
    definition: string,
    excludes: string,
    coverage: string,
    detailHref: string,
  ): DashboardMetric => ({
    id,
    label,
    value,
    unit,
    definition,
    excludes,
    coverage,
    detailHref,
    evaluatedAt,
    period: {
      from:
        id === "M1"
          ? new Date(now - 60000).toISOString()
          : id === "M2"
            ? new Date(now - 300000).toISOString()
            : null,
      to: evaluatedAt,
    },
    selection:
      id === "M2"
        ? `Categoría publicada: ${data.code ?? "no disponible"}`
        : id === "M1"
          ? "Estaciones BiciMAD instaladas y habilitadas para alquiler"
          : id === "M3"
            ? "Avisos retenidos con vigencia explícita por producto"
            : "Inventario cerrado de productos dinámicos habilitados",
    denominator:
      id === "M1"
        ? {
            included: data.bikes?.included ?? 0,
            observed: data.bikes?.denominator ?? 0,
            unit: "estaciones",
          }
        : id === "M2"
          ? {
              included: data.parking?.included ?? 0,
              observed: data.parking?.denominator ?? 0,
              unit: "aparcamientos",
            }
          : id === "M4"
            ? {
                included: usable.length,
                observed: enabled.length,
                unit: "productos",
              }
            : {
                included: null,
                observed: null,
                unit: "avisos con cobertura territorial no exhaustiva",
              },
    provenance:
      id === "M1"
        ? "Lecturas de estaciones BiciMAD guardadas"
        : id === "M2"
          ? "Muestras publicadas de aparcamientos Madrid guardadas"
          : id === "M3"
            ? "Avisos guardados Renfe, EMT, DGT y CAP AEMET"
            : "Metadatos y lecturas almacenadas, política de frescura por producto",
    missingReason:
      value === null ? "Sin lecturas que cumplan todos los criterios." : null,
  });
  const enabled = products.filter((p) => p.enabled),
    usable = enabled.filter((p) => p.usable);
  return dashboardOverview.parse({
    schemaVersion: 1,
    readAt: evaluatedAt,
    evaluatedAt,
    products,
    activity,
    recentEvents: data.recentEvents.map((e) => ({
      id: e.id,
      type: e.event_type,
      outcome: e.outcome,
      source: e.source_id,
      occurredAt: iso(e.occurred_at),
    })),
    parkingCategory: data.code,
    parkingCategories: data.categories.map((r) => ({
      code: String(r.code),
      label: String(r.label),
    })),
    metrics: [
      metric(
        "M1",
        "Bicicletas disponibles",
        data.bikes?.value ?? null,
        "bicicletas",
        "Suma de bicicletas publicadas por estaciones únicas instaladas y habilitadas para alquiler, observadas en los últimos 60 segundos.",
        "Excluye estaciones antiguas, deshabilitadas y sin lectura; no es una garantía de disponibilidad al llegar.",
        `${data.bikes?.included ?? 0} de ${data.bikes?.denominator ?? 0} estaciones del catálogo almacenado`,
        "/dashboard/mobility?section=dynamic&category=bikes",
      ),
      metric(
        "M2",
        "Plazas libres publicadas",
        data.parking?.value ?? null,
        "plazas",
        `Suma de una única categoría publicada (${data.code ?? "sin categoría"}) por aparcamiento, observada en los últimos cinco minutos.`,
        "Excluye tarifas, capacidad estática, otras categorías y lecturas antiguas; las categorías no se consideran aditivas.",
        `${data.parking?.included ?? 0} de ${data.parking?.denominator ?? 0} aparcamientos con esa categoría`,
        "/dashboard/mobility?section=dynamic&category=parking",
      ),
      metric(
        "M3",
        "Avisos vigentes publicados",
        products.some((p) => p.category === "incidents" && p.usable)
          ? data.notices
          : null,
        "avisos",
        "Avisos únicos por producto con vigencia verificable y lectura reciente.",
        "No equivale a incidencias físicas distintas; excluye avisos retirados y vigencia desconocida.",
        "Avisos de Renfe, EMT, DGT y CAP AEMET con fechas de vigencia explícitas; cobertura publicada, no territorial.",
        "/dashboard/mobility?section=dynamic&category=incidents",
      ),
      metric(
        "M4",
        "Productos con datos utilizables",
        usable.length,
        `de ${enabled.length} productos habilitados`,
        "Inventario cerrado de productos dinámicos con evidencia almacenada utilizable según su política.",
        "Excluye catálogos y productos deshabilitados. No certifica cobertura territorial ni salud del proveedor.",
        "Disponibilidad por producto; los recuentos de colección no certifican frescura de cada entidad.",
        "/dashboard/sources",
      ),
    ],
    attention: products
      .filter((p) => p.enabled && p.mode === "periodic" && p.issue)
      .sort(
        (a, b) =>
          Number(
            Boolean(data.products.find((p) => p.id === b.id)?.error_code),
          ) -
          Number(Boolean(data.products.find((p) => p.id === a.id)?.error_code)),
      )
      .slice(0, 3)
      .map((p) => ({
        label: `${p.label}: ${p.issue}`,
        href: `/dashboard/sources/${p.source}`,
      })),
  });
}
