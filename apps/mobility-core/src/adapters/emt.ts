import { z } from "zod";
import { id, madridTime, timestamp } from "./common";
import { emtRequest } from "./emt-client";

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

export async function fetchEmtIncidents() {
  const raw = await emtRequest("/v1/transport/busemtmad/lines/incidents/all/");
  return { raw, ...parseEmtIncidents(JSON.parse(raw)) };
}
