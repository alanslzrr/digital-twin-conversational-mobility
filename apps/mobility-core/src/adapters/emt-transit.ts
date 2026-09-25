import { z } from "zod";
import { madridTime, numeric, timestamp } from "./common.ts";
import { emtRequest } from "./emt-client.ts";

const identifier = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]+$/)
  .max(30);
const text = z.string().trim().min(1).max(300);
const point = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
  ]),
});
const line = z.object({
  line: identifier,
  label: identifier,
  nameA: text,
  nameB: text,
});
const stop = z.object({
  node: identifier,
  name: text,
  geometry: point,
  lines: z.array(z.string().regex(/^[A-Za-z0-9]+\/[12]$/)).max(200),
});
export function parseEmtCatalog(stops: unknown, lines: unknown) {
  const parsedStops = z
    .object({ code: z.literal("00"), data: z.array(stop).min(1).max(20000) })
    .parse(stops).data;
  const parsedLines = z
    .object({ code: z.literal("00"), data: z.array(line).min(1).max(1000) })
    .parse(lines).data;
  const ids = new Set(parsedLines.map((l) => l.line));
  if (
    ids.size !== parsedLines.length ||
    new Set(parsedStops.map((s) => s.node)).size !== parsedStops.length
  )
    throw new Error("emt_catalog_duplicate_identity");
  for (const s of parsedStops)
    for (const reference of s.lines)
      if (!ids.has(reference.split("/")[0] ?? ""))
        throw new Error("emt_catalog_unknown_line");
  return { stops: parsedStops, lines: parsedLines };
}

// EMT's operation datetime is Madrid civil time without an offset. Never use the
// download time as an invented vehicle observation; ambiguous DST is rejected.
export function emtOperationTime(value: string, now = Date.now()) {
  if (/(Z|[+-]\d{2}:\d{2})$/.test(value))
    return timestamp(Date.parse(value) / 1000, now);
  const m = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/,
  );
  if (!m) throw new Error("invalid_observation_time");
  return timestamp(
    Date.parse(
      madridTime(
        ...(m.slice(1, 7).map(Number) as [
          number,
          number,
          number,
          number,
          number,
          number,
        ]),
      ),
    ) / 1000,
    now,
  );
}
const arrival = z.object({
  line: identifier,
  stop: identifier,
  destination: z.string().trim().max(300).nullish(),
  estimateArrive: numeric.pipe(z.number().int().nonnegative()),
  DistanceBus: numeric.pipe(z.number().nonnegative()).nullish(),
});
export function parseEmtArrivals(
  input: unknown,
  stopId: string,
  now = Date.now(),
) {
  const body = z
    .object({
      code: z.literal("00"),
      datetime: z.string(),
      data: z.array(z.object({ Arrive: z.array(arrival).max(500) })).length(1),
    })
    .parse(input);
  const observedAt = emtOperationTime(body.datetime, now);
  const rows = body.data[0]?.Arrive ?? [];
  if (rows.some((a) => a.stop !== stopId))
    throw new Error("emt_arrival_stop_mismatch");
  return {
    observedAt,
    arrivals: rows.map((a) => ({
      line: a.line,
      destination: a.destination || null,
      destinationEvidence: a.destination
        ? ("provider" as const)
        : ("unknown" as const),
      // 999999 is a provider sentinel, NOT a countdown of eleven days.
      estimateSecondsAtObservation:
        a.estimateArrive === 999999 ? null : a.estimateArrive,
      estimatedArrivalAt:
        a.estimateArrive === 999999
          ? null
          : new Date(
              Date.parse(observedAt) + a.estimateArrive * 1000,
            ).toISOString(),
      estimateStatus:
        a.estimateArrive === 999999
          ? ("beyond_prediction_horizon" as const)
          : ("estimated" as const),
      distanceMeters: a.DistanceBus ?? null,
    })),
  };
}
export async function fetchEmtArrivals(stopId: string) {
  identifier.parse(stopId);
  const raw = await emtRequest(
    `/v3/transport/busemtmad/stops/${encodeURIComponent(stopId)}/arrives/all/`,
    {
      cultureInfo: "ES",
      Text_StopRequired_YN: "N",
      Text_EstimationsRequired_YN: "Y",
      Text_IncidencesRequired_YN: "N",
      DateTime_Referenced_Incidencies_YYYYMMDD: "",
    },
  );
  return { raw, ...parseEmtArrivals(JSON.parse(raw), stopId) };
}
