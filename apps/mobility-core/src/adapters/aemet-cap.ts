import { gunzipSync } from "node:zlib";
import type { MadridWarnings, WeatherAlert } from "@mobility/contracts";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  processEntities: false,
});
function parse(text: string) {
  if (
    text.length > 2_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(text) ||
    XMLValidator.validate(text) !== true
  )
    throw Error("invalid_weather_xml");
  return xml.parse(text);
}
const array = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
const time = (v: unknown) =>
  new Date(z.iso.datetime({ offset: true }).parse(v)).toISOString();
export function warningIndex(text: string) {
  const f = parse(text).feed;
  const entries = array(f?.entry);
  if (entries.length !== 1) throw Error("invalid_warning_index");
  const entry = entries[0] as { link: unknown; updated: unknown };
  const links = array(entry.link) as { "@_href"?: string }[];
  const link = links.find((l) => l["@_href"]?.endsWith("_AFAP7228.tar.gz"))?.[
    "@_href"
  ];
  if (!link) throw Error("missing_warning_bundle");
  return { url: officialWarningBundle(link), issuedAt: time(entry.updated) };
}
export function officialWarningBundle(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.hostname !== "www.aemet.es" ||
    u.port ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !/^\/documentos_d\/eltiempo\/prediccion\/avisos\/cap\/Z_CAP_C_LEMM_\d{14}_AFAP7228\.tar\.gz$/.test(
      u.pathname,
    )
  )
    throw Error("invalid_warning_bundle");
  return u.href;
}
export function capFiles(compressed: Uint8Array) {
  if (compressed.length > 2_000_000) throw Error("weather_archive_limit");
  const raw = gunzipSync(compressed, { maxOutputLength: 4_000_000 });
  const files: string[] = [];
  const names = new Set<string>();
  let offset = 0,
    terminated = false;
  while (offset + 512 <= raw.length) {
    const header = raw.subarray(offset, offset + 512);
    if (header.every((n) => n === 0)) {
      if (
        offset + 1024 > raw.length ||
        !raw.subarray(offset + 512).every((n) => n === 0)
      )
        throw Error("weather_archive_truncated");
      terminated = true;
      break;
    }
    const str = (a: number, b: number) =>
      header.subarray(a, b).toString("utf8").split("\0")[0]?.trim() ?? "";
    const name = str(0, 100),
      size = parseInt(str(124, 136), 8),
      checksum = parseInt(str(148, 156), 8);
    const actual = header.reduce(
      (s, n, i) => s + (i >= 148 && i < 156 ? 32 : n),
      0,
    );
    if (
      checksum !== actual ||
      !/^Z_CAP_[A-Za-z0-9_]+\.xml$/.test(name) ||
      names.has(name) ||
      !["0", ""].includes(str(156, 157)) ||
      str(345, 500) ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > 200_000 ||
      offset + 512 + size > raw.length ||
      files.length >= 100
    )
      throw Error("invalid_weather_archive");
    names.add(name);
    files.push(
      raw.subarray(offset + 512, offset + 512 + size).toString("utf8"),
    );
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!terminated || !files.length) throw Error("weather_archive_incomplete");
  return files;
}
const areaSchema = z.object({
  areaDesc: z.string(),
  polygon: z.union([z.string(), z.array(z.string())]),
  geocode: z.union([
    z.object({ valueName: z.string(), value: z.string() }),
    z.array(z.object({ valueName: z.string(), value: z.string() })),
  ]),
});
export function parseWarnings(
  files: string[],
  issuedAt: string,
): MadridWarnings {
  const records: WeatherAlert[] = [];
  const superseded = new Set<string>();
  const ids = new Set<string>();
  for (const file of files) {
    const a = parse(file).alert;
    if (!a?.identifier || !a.sent || !a.status || !a.msgType || !a.scope)
      throw Error("invalid_cap");
    if (a.status !== "Actual" || a.scope !== "Public") continue;
    if (!["Alert", "Update", "Cancel"].includes(a.msgType))
      throw Error("unsupported_cap_message");
    const id = z.string().max(200).parse(a.identifier);
    if (ids.has(id)) throw Error("duplicate_cap");
    ids.add(id);
    time(a.sent);
    const references = String(a.references ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((r) => {
        const parts = r.split(",");
        if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2])
          throw Error("invalid_cap_reference");
        time(parts[2]);
        return parts[1];
      });
    for (const r of references) superseded.add(r);
    if (a.msgType === "Cancel") continue;
    const infos = array(a.info) as Record<string, unknown>[];
    const info = infos.find((i) => i.language === "es-ES");
    if (!info) throw Error("missing_spanish_cap");
    const eventCode = array(info.eventCode) as {
      valueName: string;
      value: string;
    }[];
    const phenomenon = eventCode
      .find((e) => e.valueName === "AEMET-Meteoalerta fenomeno")
      ?.value.split(";")[0];
    if (!phenomenon) throw Error("missing_cap_phenomenon");
    const severity = z
      .enum(["Minor", "Moderate", "Severe", "Extreme", "Unknown"])
      .parse(info.severity);
    const areas = array(info.area).map((v) => {
      const ar = areaSchema.parse(v);
      const code = array(ar.geocode).find(
        (g) => g.valueName === "AEMET-Meteoalerta zona",
      )?.value;
      if (!code || !/^72280[123]$/.test(code))
        throw Error("unexpected_cap_zone");
      const polygons = array(ar.polygon).map((p) => {
        const points = p
          .trim()
          .split(/\s+/)
          .map((pair) => {
            const values = pair.split(",").map(Number);
            const lat = values[0],
              lon = values[1];
            if (
              values.length !== 2 ||
              lat === undefined ||
              lon === undefined ||
              !Number.isFinite(lat) ||
              !Number.isFinite(lon) ||
              lat < 39 ||
              lat > 42 ||
              lon < -5 ||
              lon > -2
            )
              throw Error("invalid_cap_polygon");
            return [lon, lat];
          });
        if (
          points.length < 4 ||
          points.length > 2000 ||
          JSON.stringify(points[0]) !== JSON.stringify(points.at(-1))
        )
          throw Error("invalid_cap_polygon");
        return points;
      });
      return { code, name: ar.areaDesc, polygons };
    });
    if (!areas.length) throw Error("missing_cap_area");
    const level =
      (array(info.parameter) as { valueName: string; value: string }[]).find(
        (p) => p.valueName === "AEMET-Meteoalerta nivel",
      )?.value ?? severity;
    records.push({
      id,
      sent: time(a.sent),
      references,
      messageType: a.msgType,
      phenomenon,
      severity,
      level,
      event: z.string().max(300).parse(info.event),
      validFrom: time(info.onset ?? info.effective),
      validTo: time(info.expires),
      areas,
    });
  }
  const current = records.filter((r) => !superseded.has(r.id));
  if (!ids.size) throw Error("no_operational_cap");
  return {
    product: "warnings",
    issuedAt,
    validFrom: current.reduce(
      (a, r) => (r.validFrom < a ? r.validFrom : a),
      current[0]?.validFrom ?? issuedAt,
    ),
    validTo: current.reduce(
      (a, r) => (r.validTo > a ? r.validTo : a),
      issuedAt,
    ),
    records: current,
  };
}
