import { z } from "zod";
import { fetchText, id, madridTime, timestamp } from "./common";

const item = z.object({
  guid: id,
  title: z.string().max(12000),
  description: z.string().max(50000),
  category: z
    .union([z.string().max(40), z.array(z.string().max(40)).max(300)])
    .nullish()
    .transform((value) =>
      typeof value === "string" ? [value] : (value ?? []),
    ),
  pubDate: z.string(),
  rssAfectaDesde: z.string().nullish(),
  rssAfectaHasta: z.string().nullish(),
  GoogleTransitEffect: z.string().nullish(),
  GoogleTransitCause: z.string().nullish(),
});

function civil(value: string | null | undefined) {
  const m = value?.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/,
  );
  if (!m) return null;
  try {
    return madridTime(
      Number(m[3]),
      Number(m[2]),
      Number(m[1]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
    );
  } catch {
    return null;
  }
}
const plain = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function parseEmtIncidents(input: unknown, now = Date.now()) {
  const data = z
    .object({
      code: z.literal("00"),
      data: z
        .array(
          z.object({
            lastBuildDate: z.string(),
            item: z.array(item).max(10000),
          }),
        )
        .length(1),
    })
    .parse(input).data[0];
  if (!data) throw new Error("emt_data_unavailable");
  const observedAt = timestamp(Date.parse(data.lastBuildDate) / 1000, now);
  return {
    observedAt,
    alerts: data.item.map((a) => {
      const startsAt = civil(a.rssAfectaDesde);
      const endsAt = civil(a.rssAfectaHasta);
      const ordered = !startsAt || !endsAt || startsAt <= endsAt;
      const temporalStatus =
        !ordered || !startsAt || !endsAt
          ? "unknown"
          : Date.parse(startsAt) > now
            ? "upcoming"
            : Date.parse(endsAt) < now
              ? "expired"
              : "active";
      return {
        id: a.guid,
        title: plain(a.title),
        description: plain(a.description),
        lines: a.category,
        publishedAt: a.pubDate,
        startsAt,
        endsAt,
        temporalStatus,
        effect: a.GoogleTransitEffect ?? null,
        cause: a.GoogleTransitCause ?? null,
      };
    }),
  };
}

let cached: { token: string; expires: number } | undefined;
async function accessToken() {
  if (cached && cached.expires > Date.now()) return cached.token;
  const client = process.env.EMT_CLIENT_ID;
  const key = process.env.EMT_PASSKEY;
  if (!client || !key) throw new Error("emt_credentials_missing");
  const body = JSON.parse(
    await fetchText(
      "https://openapi.emtmadrid.es/v2/mobilitylabs/user/login/",
      "application/json",
      { headers: { "X-ClientId": client, passKey: key } },
    ),
  );
  const parsed = z
    .object({
      code: z.enum(["00", "01"]),
      data: z
        .array(
          z.object({
            accessToken: z.string().min(1),
            tokenSecExpiration: z.coerce.number().positive(),
          }),
        )
        .min(1),
    })
    .safeParse(body);
  if (!parsed.success || !parsed.data.data[0])
    throw new Error("emt_authentication_failed");
  const row = parsed.data.data[0];
  cached = {
    token: row.accessToken,
    expires:
      Date.now() +
      Math.max(0, Math.min(row.tokenSecExpiration, 3600) - 60) * 1000,
  };
  return cached.token;
}

export async function fetchEmtIncidents() {
  try {
    const raw = await fetchText(
      "https://openapi.emtmadrid.es/v1/transport/busemtmad/lines/incidents/all/",
      "application/json",
      { headers: { accessToken: await accessToken() } },
    );
    return { raw, ...parseEmtIncidents(JSON.parse(raw)) };
  } catch (error) {
    // Discard rejected tokens; the bounded job backoff controls the next attempt.
    cached = undefined;
    throw error;
  }
}
