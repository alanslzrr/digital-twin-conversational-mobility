import { dashboardEntitySeries } from "@mobility/contracts";
import { jobPolicies } from "@mobility/domain";
import { z } from "zod";
import { database } from "../database";
import { DashboardAccessError } from "./access";

const query = z.strictObject({
  window: z.enum(["1h", "6h", "24h"]).default("6h"),
  magnitude: z
    .enum([
      "bikes",
      "docks",
      "freeSpaces",
      "value",
      "vehiclesPerHour",
      "occupancyPercent",
      "loadPercent",
      "temperature",
      "relative_humidity",
      "precipitation",
      "mean_wind_speed",
      "maximum_wind_gust",
      "station_pressure",
    ])
    .optional(),
  product: z.string().max(80).optional(),
});
const supported = {
  bikes: {
    product: "bicimad",
    array: "stations",
    default: "bikes",
    magnitudes: ["bikes", "docks"],
  },
  parking: {
    product: "madrid-parking",
    array: "parkings",
    default: "freeSpaces",
    magnitudes: ["freeSpaces"],
  },
  traffic: {
    product: "madrid-traffic",
    array: "sensors",
    default: "vehiclesPerHour",
    magnitudes: ["vehiclesPerHour", "occupancyPercent", "loadPercent"],
  },
  environment: {
    product: "madrid-air",
    array: "readings",
    default: "value",
    magnitudes: ["value"],
  },
} as const;
export async function readEntitySeries(
  category: string,
  id: string,
  input: unknown,
) {
  const weather =
    category === "environment" &&
    (input as { product?: string })?.product === "aemet";
  const p = weather
    ? {
        product: "aemet" as const,
        array: "readings",
        default: "temperature",
        magnitudes: [
          "temperature",
          "relative_humidity",
          "precipitation",
          "mean_wind_speed",
          "maximum_wind_gust",
          "station_pressure",
        ],
      }
    : supported[category as keyof typeof supported];
  if (!p) throw new DashboardAccessError(400, "history_not_supported");
  const i = query.parse(input),
    magnitude = i.magnitude ?? p.default;
  if (
    !(p.magnitudes as readonly string[]).includes(magnitude) ||
    (i.product && i.product !== p.product)
  )
    throw new DashboardAccessError(400, "invalid_request");
  const valueField = weather ? "value" : magnitude;
  const to = new Date().toISOString(),
    from = new Date(
      Date.parse(to) -
        { "1h": 3600000, "6h": 21600000, "24h": 86400000 }[i.window],
    ).toISOString();
  const step = (Date.parse(to) - Date.parse(from)) / 240;
  return database().begin(
    "isolation level repeatable read read only",
    async (sql) => {
      await sql`SET LOCAL statement_timeout='3s'`;
      await sql`SET LOCAL lock_timeout='100ms'`;
      const rows =
        await sql`WITH revisions AS (SELECT * FROM mobility_history WHERE job_id=${p.product} AND ingested_at>=now()-interval '24 hours' AND observed_at>=${from}::timestamptz AND observed_at<=${to}::timestamptz), entries AS (
      SELECT h.ingested_at,h.revision_id,e.value||sample.value||CASE WHEN ${category}='traffic' THEN jsonb_build_object('observedAt',h.observed_at) ELSE '{}'::jsonb END AS entity FROM revisions h CROSS JOIN LATERAL jsonb_array_elements(coalesce(h.payload->${p.array},'[]'::jsonb)) e(value)
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN ${category}='parking' THEN coalesce(e.value->'availability','[]'::jsonb) WHEN ${weather} THEN coalesce(e.value->'measurements','[]'::jsonb) ELSE '[{}]'::jsonb END) sample(value)
      WHERE CASE WHEN ${category}='parking' THEN (e.value->>'id')||':'||(sample.value->>'category') WHEN ${weather} THEN e.value->>'stationId' WHEN ${category}='environment' THEN (e.value->>'stationId')||':'||(e.value->>'name') ELSE e.value->>'id' END=${id} AND (NOT ${weather} OR sample.value->>'name'=${magnitude})), unique_observations AS (
      SELECT DISTINCT ON((entity->>'observedAt')::timestamptz) (entity->>'observedAt')::timestamptz AS observed_at,ingested_at,revision_id,(entity->>${valueField})::double precision AS value,entity->>'unit' AS unit FROM entries WHERE entity->>'observedAt' IS NOT NULL AND jsonb_typeof(entity->${valueField})='number' ORDER BY (entity->>'observedAt')::timestamptz,ingested_at DESC,revision_id DESC), buckets AS (
      SELECT *,floor(extract(epoch FROM (observed_at-${from}::timestamptz))*1000/${step}) AS bucket FROM unique_observations WHERE observed_at>=${from}::timestamptz AND observed_at<${to}::timestamptz)
      SELECT DISTINCT ON(bucket) *,count(*) OVER()::int AS original_count FROM buckets ORDER BY bucket,observed_at DESC LIMIT 240`;
      const units = new Set(rows.map((r) => r.unit).filter(Boolean));
      if (
        units.size > 1 ||
        (category === "environment" &&
          rows.length > 0 &&
          (units.size !== 1 || rows.some((r) => !r.unit)))
      )
        throw new DashboardAccessError(409, "incompatible_measurement_units");
      return dashboardEntitySeries.parse({
        schemaVersion: 1,
        readAt: to,
        from,
        to,
        product: p.product,
        entityId: id,
        magnitude,
        unit:
          magnitude === "vehiclesPerHour"
            ? "vehículos/h"
            : magnitude === "occupancyPercent" || magnitude === "loadPercent"
              ? "%"
              : magnitude === "bikes"
                ? "bicicletas"
                : magnitude === "docks"
                  ? "anclajes"
                  : magnitude === "freeSpaces"
                    ? "plazas"
                    : units.size
                      ? String([...units][0])
                      : "unidad publicada no indicada",
        mode: "event",
        gapSeconds: jobPolicies[p.product].maxAge,
        points: rows.map((r) => ({
          observedAt: new Date(r.observed_at).toISOString(),
          ingestedAt: new Date(r.ingested_at).toISOString(),
          revisionId: String(r.revision_id),
          value: Number(r.value),
        })),
        reduced: Number(rows[0]?.original_count ?? 0) > rows.length,
        coverage: "partial",
        warning:
          (weather &&
          ["precipitation", "mean_wind_speed", "maximum_wind_gust"].includes(
            magnitude,
          )
            ? "Magnitud acumulada o agregada durante su periodo publicado, no instantánea. "
            : "") +
          "Observaciones con la última revisión retenida; algunas correcciones se conocieron después. Hasta 24 horas retenidas y última muestra por intervalo; sin interpolación ni reconstrucción completa del sistema.",
      });
    },
  );
}
