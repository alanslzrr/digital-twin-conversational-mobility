import type { WeatherProduct } from "@mobility/contracts";
import { weatherResource } from "./aemet";
import { capFiles, parseWarnings, warningIndex } from "./aemet-cap";
import { parseDailyForecast } from "./aemet-daily";
import { parseHourlyForecast } from "./aemet-forecast";
export const warningIndexUrl =
  "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAP7228_ATOM.xml";
export class WeatherHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter: number = 0,
  ) {
    super(`upstream_http_${status}`);
  }
}
function retryAfterSeconds(response: Response) {
  const raw = response.headers.get("retry-after");
  const delay = raw
    ? Number.isFinite(Number(raw))
      ? Number(raw)
      : Math.max(0, (Date.parse(raw) - Date.now()) / 1000)
    : 0;
  return Number.isFinite(delay) ? Math.min(604800, Math.max(0, delay)) : 0;
}
export async function weatherResponse(
  url: string,
  signal: AbortSignal,
  headers: Record<string, string> = {},
) {
  const response = await fetch(url, {
    signal,
    headers,
    redirect: "error",
    cache: "no-store",
  });
  if (response.status === 304) return { response, bytes: Buffer.alloc(0) };
  if (!response.ok) {
    await response.body?.cancel();
    throw new WeatherHttpError(response.status, retryAfterSeconds(response));
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (!response.body) throw Error("weather_empty_response");
    for await (const chunk of response.body) {
      signal.throwIfAborted();
      size += chunk.length;
      if (size > 2_000_000) throw Error("weather_body_limit");
      chunks.push(chunk);
    }
  } catch (e) {
    await response.body?.cancel().catch(() => {});
    throw e;
  }
  return { response, bytes: Buffer.concat(chunks) };
}
function text(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("iso-8859-15").decode(bytes);
  }
}
export async function fetchWeatherProduct(
  resource: string,
  signal: AbortSignal,
  previous: { payload: WeatherProduct | null; lastModified: string | null },
) {
  if (resource === "warnings:28") {
    const index = await weatherResponse(
      warningIndexUrl,
      signal,
      previous.payload && previous.lastModified
        ? { "If-Modified-Since": previous.lastModified }
        : {},
    );
    if (index.response.status === 304) {
      if (!previous.payload) throw Error("weather_304_without_state");
      return { notModified: true as const };
    }
    const parsed = warningIndex(text(index.bytes));
    // Some intermediaries ignore If-Modified-Since. The validated Atom publication
    // identifies the full bundle; do not download it again when it is unchanged.
    if (
      previous.payload?.product === "warnings" &&
      previous.payload.issuedAt === parsed.issuedAt
    )
      return { notModified: true as const };
    const archive = await weatherResponse(parsed.url, signal);
    const payload = parseWarnings(capFiles(archive.bytes), parsed.issuedAt);
    return {
      notModified: false as const,
      payload,
      lastModified: index.response.headers.get("last-modified"),
    };
  }
  if (/^daily:28\d{3}$/.test(resource)) {
    const municipality = resource.slice(6);
    const daily = await weatherResponse(
      `https://www.aemet.es/xml/municipios/localidad_${municipality}.xml`,
      signal,
      previous.payload?.product === "daily_forecast" && previous.lastModified
        ? { "If-Modified-Since": previous.lastModified }
        : {},
    );
    if (daily.response.status === 304) {
      if (previous.payload?.product !== "daily_forecast")
        throw Error("weather_304_without_state");
      return { notModified: true as const };
    }
    const payload = parseDailyForecast(text(daily.bytes), municipality);
    if (JSON.stringify(payload) === JSON.stringify(previous.payload))
      return { notModified: true as const };
    return {
      notModified: false as const,
      payload,
      lastModified: daily.response.headers.get("last-modified"),
    };
  }
  if (!/^forecast:28\d{3}$/.test(resource))
    throw Error("invalid_weather_resource");
  const key = process.env.AEMET_API_KEY;
  if (!key) throw Error("aemet_credentials_missing");
  const municipality = resource.slice(9);
  const envelopeResponse = await weatherResponse(
    `https://opendata.aemet.es/opendata/api/prediccion/especifica/municipio/horaria/${municipality}`,
    signal,
    { api_key: key },
  );
  const envelope = JSON.parse(text(envelopeResponse.bytes));
  if (Number(envelope.estado) !== 200)
    throw new WeatherHttpError(
      Number(envelope.estado) || 503,
      retryAfterSeconds(envelopeResponse.response),
    );
  const data = await weatherResponse(weatherResource(envelope.datos), signal);
  return {
    notModified: false as const,
    payload: parseHourlyForecast(JSON.parse(text(data.bytes)), municipality),
    lastModified: null,
  };
}
