import { z } from "zod";
import { boundedSignal } from "../execution-signal";
import { numeric } from "./common";

export const geocoderBounds = {
  west: -4.6,
  south: 39.8,
  east: -3.0,
  north: 41.2,
};
export function geocoderConfig() {
  if (
    process.env.VERCEL ||
    process.env.GEOCODER_ENABLED !== "true" ||
    !process.env.GEOCODER_URL
  )
    return null;
  const url = new URL(process.env.GEOCODER_URL);
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error("geocoder_configuration_invalid");
  const agent = process.env.GEOCODER_USER_AGENT;
  if (!agent || agent.length < 12 || /[\r\n]/.test(agent))
    throw Error("geocoder_identification_required");
  if (
    url.hostname === "nominatim.openstreetmap.org" &&
    process.env.GEOCODER_PUBLIC_POLICY_ACCEPTED !== "true"
  )
    return null;
  return { url: url.href, agent };
}
const results = z
  .array(
    z.object({
      osm_type: z.enum(["node", "way", "relation"]),
      osm_id: numeric.pipe(z.number().int().positive().safe()),
      display_name: z
        .string()
        .min(1)
        .max(1000)
        .transform((x) => x.replace(/\p{Cc}/gu, " ")),
      lat: numeric.pipe(z.number().min(-90).max(90)),
      lon: numeric.pipe(z.number().min(-180).max(180)),
      type: z.string().max(100).optional(),
      addresstype: z.string().max(100).optional(),
      address: z.object({
        country_code: z.string(),
        house_number: z.string().max(100).optional(),
      }),
    }),
  )
  .max(10);
export function parseGeocodes(raw: unknown) {
  const seen = new Set<string>();
  return results
    .parse(raw)
    .filter(
      (r) =>
        r.address.country_code === "es" &&
        r.lat >= geocoderBounds.south &&
        r.lat <= geocoderBounds.north &&
        r.lon >= geocoderBounds.west &&
        r.lon <= geocoderBounds.east,
    )
    .flatMap((r) => {
      const externalId = `${r.osm_type}:${r.osm_id}`;
      if (seen.has(externalId)) return [];
      seen.add(externalId);
      return [
        {
          externalId,
          name: r.display_name,
          latitude: r.lat,
          longitude: r.lon,
          precision: r.address.house_number
            ? "address_point_or_building"
            : (r.addresstype ?? r.type ?? "unknown"),
          sourceUrl: `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}`,
        },
      ];
    });
}
export async function fetchGeocodes(
  query: string,
  config: NonNullable<ReturnType<typeof geocoderConfig>>,
) {
  const url = new URL(config.url);
  for (const [key, value] of Object.entries({
    q: query,
    format: "jsonv2",
    countrycodes: "es",
    viewbox: "-4.6,41.2,-3,39.8",
    bounded: "1",
    limit: "5",
    addressdetails: "1",
    "accept-language": "es",
  }))
    url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { "User-Agent": config.agent, Accept: "application/json" },
    signal: boundedSignal(AbortSignal.timeout(10000)),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) throw Error(`upstream_http_${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw Error("geocoder_empty_body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1000000) throw Error("geocoder_response_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return parseGeocodes(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}
