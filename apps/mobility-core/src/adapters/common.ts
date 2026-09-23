import { z } from "zod";

export const numeric = z
  .union([z.number(), z.string().trim().min(1)])
  .transform(Number)
  .pipe(z.number().finite());
export const epoch = numeric.pipe(z.number().int().positive());
export const id = z.string().trim().min(1).max(200);

export function timestamp(seconds: number, now = Date.now()) {
  const millis = seconds * 1000;
  if (
    !Number.isSafeInteger(millis) ||
    millis > now + 30_000 ||
    millis < Date.UTC(2000, 0, 1)
  )
    throw new Error("invalid_observation_time");
  return new Date(millis).toISOString();
}

// Madrid data uses civil time, not UTC. Reject nonexistent/ambiguous DST hours
// rather than silently inventing an instant; other readings remain usable.
export function madridTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
) {
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > 31 ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 24 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  )
    throw new Error("invalid_civil_time");
  const dayStart = new Date(Date.UTC(year, month - 1, day));
  if (dayStart.getUTCMonth() !== month - 1)
    throw new Error("invalid_civil_time");
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const format = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const expected = new Date(wall).toISOString().slice(0, 19).replace("T", " ");
  const candidates = [1, 2]
    .map((offset) => wall - offset * 3_600_000)
    .filter((instant) => format.format(instant) === expected);
  if (candidates.length !== 1) throw new Error("ambiguous_civil_time");
  return new Date(candidates[0] as number).toISOString();
}

export async function fetchText(
  url: string,
  accept = "application/json",
  options: Pick<RequestInit, "method" | "headers" | "body"> = {},
) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: accept, ...options.headers },
    signal: AbortSignal.timeout(12_000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok || !response.body)
    throw new Error(`upstream_http_${response.status}`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 8_000_000) throw new Error("upstream_payload_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
