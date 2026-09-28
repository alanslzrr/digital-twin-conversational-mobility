import type { MunicipalForecast, WeatherPeriod } from "@mobility/contracts";
import { z } from "zod";
import { madridTime } from "./common";

const item = z.object({
  periodo: z.string().regex(/^\d{2}(\d{2})?$/),
  value: z.union([z.string(), z.number()]),
  descripcion: z.string().optional(),
});
const day = z.object({
  fecha: z.string(),
  precipitacion: z.array(item),
  temperatura: z.array(item),
  probPrecipitacion: z.array(item),
  probTormenta: z.array(item).optional(),
  probNieve: z.array(item).optional(),
  nieve: z.array(item).optional(),
  estadoCielo: z.array(item).optional(),
  vientoAndRachaMax: z
    .array(
      z.object({
        periodo: z.string(),
        value: z.string().optional(),
        velocidad: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});
function civil(date: string, hour: number) {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.floor(hour / 24));
  return madridTime(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    ((hour % 24) + 24) % 24,
  );
}
export function parseHourlyForecast(
  value: unknown,
  municipality: string,
): MunicipalForecast {
  const [data] = z
    .array(
      z.object({
        id: z.coerce.string(),
        nombre: z.string(),
        elaborado: z.string(),
        prediccion: z.object({ dia: z.array(day).min(1).max(4) }),
      }),
    )
    .length(1)
    .parse(value);
  if (!data || data.id !== municipality)
    throw Error("weather_municipality_mismatch");
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(
    data.elaborado,
  );
  if (!parts) throw Error("weather_issue_time_invalid");
  const issuedAt = madridTime(
    Number(parts[1]),
    Number(parts[2]),
    Number(parts[3]),
    Number(parts[4]),
    Number(parts[5]),
    Number(parts[6]),
  );
  const periods: WeatherPeriod[] = [];
  let omittedAmbiguousPeriods = 0;
  for (const d of data.prediccion.dia) {
    const groups = [
      ["precipitacion", "precipitation", "mm"],
      ["temperatura", "temperature", "°C"],
      ["probPrecipitacion", "precipitation_probability", "%"],
      ["probTormenta", "storm_probability", "%"],
      ["probNieve", "snow_probability", "%"],
      ["nieve", "snow", "mm"],
      ["estadoCielo", "sky", "code"],
    ] as const;
    for (const [field, kind, unit] of groups)
      for (const row of d[field] ?? []) {
        if (row.value === "") continue;
        let start = Number(row.periodo.slice(0, 2)),
          end = start;
        const basis =
          row.periodo.length === 4 ||
          kind === "precipitation" ||
          kind === "snow"
            ? "interval"
            : "instant";
        if (row.periodo.length === 4) {
          end = Number(row.periodo.slice(2));
          if (end <= start) end += 24;
        } else if (basis === "interval") start -= 1;
        // OpenData metadata specifies the previous hour. Public graph labels use
        // a different convention; JSON probability periods are already local.
        if (start < -1 || start > 24 || end > 48)
          throw Error("weather_period_invalid");
        try {
          const validFrom = civil(d.fecha, start),
            validTo = civil(d.fecha, end);
          const v =
            kind === "sky"
              ? String(row.value)
              : row.value === "Ip"
                ? "Ip"
                : Number(row.value);
          if (
            typeof v === "number" &&
            (!Number.isFinite(v) ||
              (unit === "%" && (v < 0 || v > 100)) ||
              (unit === "mm" && v < 0))
          )
            throw Error("weather_value_invalid");
          periods.push({
            kind,
            unit,
            value: v,
            validFrom,
            validTo,
            period: row.periodo,
            basis,
          });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "ambiguous_civil_time"
          ) {
            omittedAmbiguousPeriods++;
            continue;
          }
          throw error;
        }
      }
    for (const row of d.vientoAndRachaMax ?? []) {
      // The authenticated metadata does not define the hourly gust accumulation
      // convention unambiguously. Do not present it as an instantaneous reading.
      if (row.value !== undefined) continue;
      const value = row.velocidad?.[0];
      if (value === undefined || value === "") continue;
      try {
        const at = civil(d.fecha, Number(row.periodo));
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) throw Error("weather_wind_invalid");
        periods.push({
          kind: row.value === undefined ? "wind" : "gust",
          value: n,
          unit: "km/h",
          validFrom: at,
          validTo: at,
          period: row.periodo,
          basis: "instant",
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "ambiguous_civil_time"
        ) {
          omittedAmbiguousPeriods++;
          continue;
        }
        throw error;
      }
    }
  }
  const intervals = periods.filter((p) => p.kind === "precipitation");
  if (!intervals.length) throw Error("weather_periods_missing");
  return {
    product: "forecast",
    municipality,
    name: data.nombre,
    issuedAt,
    validFrom: intervals.reduce(
      (a, p) => (p.validFrom < a ? p.validFrom : a),
      intervals[0]?.validFrom ?? "",
    ),
    validTo: intervals.reduce((a, p) => (p.validTo > a ? p.validTo : a), ""),
    periods,
    timeZone: "Europe/Madrid",
    omittedAmbiguousPeriods,
  };
}
