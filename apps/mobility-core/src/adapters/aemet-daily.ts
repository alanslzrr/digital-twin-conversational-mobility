import type { DailyForecast, DailyWeatherPeriod } from "@mobility/contracts";
import { dailyIssueAgeBasis } from "@mobility/domain";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";

const scalar = z
  .union([z.string(), z.object({ "#text": z.string().optional() })])
  .transform((v) =>
    typeof v === "string" ? v.trim() : (v["#text"] ?? "").trim(),
  );
const field = z.object({
  "#text": z.string().optional(),
  "@_periodo": z.string().optional(),
  "@_descripcion": z.string().optional(),
});
const rows = (v: unknown): unknown[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
const xml = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
});
const validDate = (v: unknown) => {
  const s = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .parse(v);
  if (
    !Number.isFinite(Date.parse(`${s}T00:00:00Z`)) ||
    new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s
  )
    throw Error("weather_date_invalid");
  return s;
};
export function parseDailyForecast(
  text: string,
  municipality: string,
): DailyForecast {
  if (
    text.length > 2_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(text) ||
    XMLValidator.validate(text) !== true
  )
    throw Error("invalid_weather_xml");
  const root = z
    .object({
      "@_id": z.string(),
      nombre: z.string(),
      elaborado: z.string(),
      prediccion: z.object({ dia: z.unknown() }),
    })
    .parse(xml.parse(text).root);
  if (root["@_id"] !== municipality || !/^28\d{3}$/.test(municipality))
    throw Error("weather_municipality_mismatch");
  const ageBasis = dailyIssueAgeBasis(root.elaborado);
  const days = rows(root.prediccion.dia);
  if (!days.length || days.length > 7) throw Error("weather_dates_invalid");
  const dates: string[] = [],
    periods: DailyWeatherPeriod[] = [],
    extremes: DailyForecast["extremes"] = [];
  let invalidFields = 0;
  for (const raw of days) {
    const day = z
      .object({
        "@_fecha": z.string(),
        prob_precipitacion: z.unknown().optional(),
        estado_cielo: z.unknown().optional(),
        temperatura: z.unknown().optional(),
      })
      .parse(raw);
    const date = validDate(day["@_fecha"]);
    if (dates.includes(date) || (dates.length && date <= (dates.at(-1) ?? "")))
      throw Error("weather_dates_invalid");
    dates.push(date);
    for (const [name, kind, unit] of [
      ["prob_precipitacion", "precipitation_probability", "%"],
      ["estado_cielo", "sky", "code"],
    ] as const) {
      const seen = new Set<string>();
      for (const value of rows(day[name])) {
        try {
          const item =
            typeof value === "string" ? { "#text": value } : field.parse(value);
          const period = item["@_periodo"] ?? "00-24";
          if (
            ![
              "00-06",
              "06-12",
              "12-18",
              "18-24",
              "00-12",
              "12-24",
              "00-24",
            ].includes(period) ||
            seen.has(period)
          )
            throw Error("invalid_period");
          seen.add(period);
          const textValue = (item["#text"] ?? "").trim();
          if (!textValue) continue;
          const n = kind === "sky" ? textValue : Number(textValue);
          if (
            typeof n === "number" &&
            (!Number.isFinite(n) || n < 0 || n > 100)
          )
            throw Error("invalid_probability");
          const [from, to] = period.split("-").map(Number) as [number, number];
          const base = Date.parse(`${date}T00:00:00Z`);
          periods.push({
            kind,
            ...(item["@_descripcion"]
              ? { description: item["@_descripcion"] }
              : {}),
            unit,
            value: n,
            period,
            date,
            originalPeriod: item["@_periodo"] ?? null,
            resolutionHours: (to - from) as 6 | 12 | 24,
            basis: "interval",
            validFrom: new Date(base + from * 3600000).toISOString(),
            validTo: new Date(base + to * 3600000).toISOString(),
          });
        } catch {
          invalidFields++;
        }
      }
    }
    const temps = z
      .object({
        minima: z.unknown().optional(),
        maxima: z.unknown().optional(),
      })
      .safeParse(day.temperatura);
    if (temps.success) {
      const number = (v: unknown) => {
        if (v === undefined) return null;
        const result = scalar.safeParse(v);
        if (!result.success) {
          invalidFields++;
          return null;
        }
        if (!result.data) return null;
        const n = Number(result.data);
        if (!Number.isFinite(n)) {
          invalidFields++;
          return null;
        }
        return n;
      };
      const minimum = number(temps.data.minima),
        maximum = number(temps.data.maxima);
      if (minimum !== null && maximum !== null && minimum > maximum)
        invalidFields++;
      else if (minimum !== null || maximum !== null)
        extremes.push({ date, minimum, maximum, unit: "°C" });
    } else if (day.temperatura !== undefined) invalidFields++;
  }
  return {
    product: "daily_forecast",
    municipality,
    name: root.nombre,
    issuedAt: null,
    issuedAtRaw: root.elaborado,
    issueTimeZone: "unspecified",
    ageBasis,
    ageBasisInterpretation: "earliest_utc_or_madrid",
    validFrom: `${dates[0]}T00:00:00.000Z`,
    validTo: new Date(
      Date.parse(`${dates.at(-1)}T00:00:00Z`) + 86400000,
    ).toISOString(),
    periods,
    extremes,
    invalidFields,
  };
}
