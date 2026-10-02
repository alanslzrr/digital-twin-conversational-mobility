import { dashboardSourceMetrics, dashboardWindow } from "@mobility/contracts";
import { z } from "zod";
import { database } from "../database";
import { ingestionEnabled } from "../ingestion";
import { presentationProducts } from "./products";
export const sourceOperation = z.enum([
  "publication",
  "refresh",
  "lease_lost",
  "lease_recovered",
  "release",
]);
export async function readSourceMetrics(
  id: string | undefined,
  params: URLSearchParams,
) {
  const window = dashboardWindow.parse(params.get("window") ?? "24h");
  const operation = params.get("operation")
    ? sourceOperation.parse(params.get("operation"))
    : null;
  const to = new Date().toISOString(),
    from = new Date(
      Date.parse(to) -
        { "1h": 3600000, "24h": 86400000, "7d": 604800000 }[window],
    ).toISOString();
  return database().begin(
    "isolation level repeatable read read only",
    async (sql) => {
      await sql`SET LOCAL statement_timeout='3s'`;
      const [errors] =
        await sql`SELECT count(*)::int AS errors FROM operational_event WHERE expires_at>now() AND occurred_at>=${from}::timestamptz AND occurred_at<${to}::timestamptz AND severity='error' AND (${id ?? null}::text IS NULL OR source_id=${id ?? null}) AND (${operation}::text IS NULL OR event_type=${operation})`;
      const durations =
        await sql`SELECT component,event_type,count(*)::int AS n,percentile_cont(.5) WITHIN GROUP(ORDER BY duration_ms) AS median,CASE WHEN count(*)>=20 THEN percentile_cont(.95) WITHIN GROUP(ORDER BY duration_ms) ELSE NULL END AS p95 FROM operational_event WHERE expires_at>now() AND occurred_at>=${from}::timestamptz AND occurred_at<${to}::timestamptz AND duration_ms IS NOT NULL AND event_type NOT IN ('lease_lost','lease_recovered') AND (${id ?? null}::text IS NULL OR source_id=${id ?? null}) AND (${operation}::text IS NULL OR event_type=${operation}) GROUP BY component,event_type ORDER BY component,event_type LIMIT 25`;
      const issues = await sql`SELECT DISTINCT id FROM (
      SELECT j.id FROM ingestion_job j JOIN source_catalog s ON s.id=j.source_id WHERE s.enabled AND j.error_code IS NOT NULL AND (${id ?? null}::text IS NULL OR j.source_id=${id ?? null})
      UNION SELECT CASE WHEN resource='warnings:28' THEN 'weather:warnings' WHEN resource LIKE 'daily:%' THEN 'weather:daily' ELSE 'weather:forecast' END FROM weather_product WHERE error_code IS NOT NULL AND EXISTS(SELECT 1 FROM source_catalog WHERE id='aemet' AND enabled) AND (${id ?? null}::text IS NULL OR ${id ?? null}='aemet')
      UNION SELECT 'emt:arrivals' FROM emt_arrival_cache WHERE error_code IS NOT NULL AND EXISTS(SELECT 1 FROM source_catalog WHERE id='emt' AND enabled) AND (${id ?? null}::text IS NULL OR ${id ?? null}='emt')) issue`;
      const enabled =
        await sql`SELECT id FROM source_catalog WHERE enabled AND (${id ?? null}::text IS NULL OR id=${id ?? null})`;
      const monitored = presentationProducts.filter((p) =>
        enabled.some((s) => s.id === p.source),
      );
      const [signal] =
        await sql`SELECT EXISTS(SELECT 1 FROM ingestion_activity WHERE active_until>now()) AS active, EXISTS(SELECT 1 FROM ingestion_worker WHERE last_seen_at>now()-interval '120 seconds') AS recent`;
      const missing =
        ingestionEnabled() && signal?.active && !signal?.recent
          ? monitored.filter((p) => p.mode === "periodic").map((p) => p.id)
          : [];
      const issueProducts = [
        ...new Set([...issues.map((r) => String(r.id)), ...missing]),
      ];
      const [capture] =
        await sql`SELECT count(*)::int AS count FROM operational_event WHERE expires_at>now()`;
      return dashboardSourceMetrics.parse({
        from,
        to,
        operation,
        errors:
          Number(capture?.count ?? 0) === 0
            ? null
            : Number(errors?.errors ?? 0),
        issueProducts,
        monitoredProducts: monitored.length,
        issueCauses: issueProducts.map((product) => ({
          product,
          cause: issues.some((r) => r.id === product)
            ? "recorded_error"
            : "missing_worker_signal",
        })),
        durations: durations.map((r) => ({
          component: String(r.component),
          operation: String(r.event_type),
          n: Number(r.n),
          medianMs: r.median == null ? null : Number(r.median),
          p95Ms: r.p95 == null ? null : Number(r.p95),
        })),
        coverage: "best_effort" as const,
        warning:
          "Errores y duraciones registrados, no salud universal ni latencia HTTP del proveedor. Un cero no demuestra ausencia de fallos.",
      });
    },
  );
}
