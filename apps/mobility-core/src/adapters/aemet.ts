import { z } from "zod";
import {
  weatherStationCatalogVersion,
  weatherStations,
} from "../catalogs/weather-stations";
import { fetchText, id, numeric, timestamp } from "./common";

const observation = z.object({
  idema: id,
  ubi: id,
  lat: numeric.pipe(z.number().min(-90).max(90)),
  lon: numeric.pipe(z.number().min(-180).max(180)),
  fint: z.string(),
  alt: numeric.nullish(),
  ta: numeric.nullish(),
  hr: numeric.pipe(z.number().min(0).max(100)).nullish(),
  prec: numeric.pipe(z.number().nonnegative()).nullish(),
  vv: numeric.pipe(z.number().nonnegative()).nullish(),
  vmax: numeric.pipe(z.number().nonnegative()).nullish(),
  pres: numeric.pipe(z.number().positive()).nullish(),
});

// The official observation metadata defines fint as UTC, including old records
// without an offset. Do not interpret it as Madrid civil time like municipal data.
function observationTime(value: string, now: number) {
  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const instant = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)
    ? normalized
    : `${normalized}Z`;
  z.iso.datetime({ offset: true }).parse(instant);
  return timestamp(Date.parse(instant) / 1000, now);
}

export function parseWeather(value: unknown, now = Date.now()) {
  const records = z.array(z.unknown()).min(1).max(1000).parse(value);
  const observations = records.flatMap((record) => {
    const parsed = observation.safeParse(record);
    if (!parsed.success) return [];
    const row = parsed.data;
    let observedAt: string;
    try {
      observedAt = observationTime(row.fint, now);
    } catch {
      return [];
    }
    const fields = [
      { name: "temperature", value: row.ta, unit: "°C", periodMinutes: 0 },
      { name: "relative_humidity", value: row.hr, unit: "%", periodMinutes: 0 },
      { name: "precipitation", value: row.prec, unit: "mm", periodMinutes: 60 },
      {
        name: "mean_wind_speed",
        value: row.vv,
        unit: "m/s",
        periodMinutes: 10,
      },
      {
        name: "maximum_wind_gust",
        value: row.vmax,
        unit: "m/s",
        periodMinutes: 60,
      },
      {
        name: "station_pressure",
        value: row.pres,
        unit: "hPa",
        periodMinutes: 0,
      },
    ];
    const measurements = fields.flatMap((field) =>
      field.value == null ? [] : [{ ...field, value: field.value }],
    );
    if (!measurements.length) return [];
    return [
      {
        stationId: row.idema,
        name: row.ubi,
        latitude: row.lat,
        longitude: row.lon,
        altitudeMeters: row.alt ?? null,
        observedAt,
        measurements,
      },
    ];
  });
  const latest = new Map<string, (typeof observations)[number]>();
  for (const row of observations) {
    const previous = latest.get(row.stationId);
    if (!previous || row.observedAt > previous.observedAt)
      latest.set(row.stationId, row);
  }
  const readings = [...latest.values()];
  if (!readings.length) throw new Error("no_valid_weather_observation");
  return {
    observedAt: readings.reduce(
      (latest, row) => (row.observedAt > latest ? row.observedAt : latest),
      "",
    ),
    readings,
  };
}

export function weatherResource(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "opendata.aemet.es" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/opendata\/sh\/[a-zA-Z0-9_-]+$/.test(url.pathname)
  )
    throw new Error("invalid_weather_resource");
  return url.href;
}

export function regionalWeatherExtract(value: unknown) {
  const ids = new Set(weatherStations.map((s) => s.id));
  const records = z
    .array(z.unknown())
    .max(50000)
    .parse(value)
    .filter(
      (row) =>
        row &&
        typeof row === "object" &&
        "idema" in row &&
        typeof row.idema === "string" &&
        ids.has(row.idema),
    );
  return {
    scope: "aemet_madrid_initial_25_stations",
    catalogVersion: weatherStationCatalogVersion,
    records,
  };
}
export async function fetchWeather() {
  const key = process.env.AEMET_API_KEY;
  if (!key) throw new Error("aemet_credentials_missing");
  const envelope = JSON.parse(
    await fetchText(
      "https://opendata.aemet.es/opendata/api/observacion/convencional/todas",
      "application/json",
      { headers: { api_key: key } },
    ),
  );
  const response = z
    .object({ estado: numeric, datos: z.string().optional() })
    .parse(envelope);
  if (response.estado !== 200 || !response.datos)
    throw new Error("aemet_data_unavailable");
  // Only observation data is persisted; no credentials, envelope or resource URLs.
  const data = await fetchText(weatherResource(response.datos));
  const extract = regionalWeatherExtract(JSON.parse(data));
  const parsed = parseWeather(extract.records);
  return { raw: JSON.stringify(extract), ...parsed };
}
