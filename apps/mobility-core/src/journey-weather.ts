import { createHash } from "node:crypto";
import type {
  WeatherEvidence,
  WeatherPeriod,
  WeatherProduct,
} from "@mobility/contracts";
import {
  selectForecast,
  selectWarnings,
  weatherRelevance,
} from "@mobility/domain";
import { weatherFreshness } from "@mobility/provenance";
import { weatherDatabase } from "./database";
import { weatherProducts } from "./weather-cache";
import { weatherQuery } from "./weather-query";

type Point = { latitude: number; longitude: number };
type Site = {
  key: string;
  latitude: number | null;
  longitude: number | null;
  stop_id: string | null;
  start: string;
  end: string;
  walk: boolean;
  alternative: number;
};
type Itinerary = {
  start: string;
  end: string;
  legs: {
    mode: string;
    from: { stop?: { gtfsId: string } | null | undefined };
    to: { stop?: { gtfsId: string } | null | undefined };
    start: { scheduledTime: string };
    end: { scheduledTime: string };
  }[];
};
const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null);
export async function journeyWeather(
  routes: Itinerary[],
  origin: Point,
  destination: Point,
  product?: "hourly_forecast" | "warnings",
) {
  const signal = AbortSignal.timeout(2000);
  try {
    const sites: Site[] = [];
    for (const [alternative, r] of routes.entries()) {
      sites.push(
        {
          key: `${alternative}:origin`,
          ...origin,
          stop_id: null,
          start: r.start,
          end: new Date(Date.parse(r.start) + 1000).toISOString(),
          walk: false,
          alternative,
        },
        {
          key: `${alternative}:destination`,
          ...destination,
          stop_id: null,
          start: r.end,
          end: new Date(Date.parse(r.end) + 1000).toISOString(),
          walk: false,
          alternative,
        },
      );
      for (const [i, l] of r.legs.entries())
        for (const side of ["from", "to"] as const) {
          const coords =
            product !== undefined || (i === 0 && side === "from")
              ? origin
              : i === r.legs.length - 1 && side === "to"
                ? destination
                : null;
          const at =
            side === "from" ? l.start.scheduledTime : l.end.scheduledTime;
          sites.push({
            key: `${alternative}:${i}:${side}`,
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null,
            stop_id: l[side].stop?.gtfsId ?? null,
            start:
              l.mode === "WALK" || l.mode === "CONTEXT"
                ? l.start.scheduledTime
                : at,
            end:
              l.mode === "WALK" || l.mode === "CONTEXT"
                ? l.end.scheduledTime
                : new Date(Date.parse(at) + 1000).toISOString(),
            walk: l.mode === "WALK",
            alternative,
          });
        }
    }
    const sql = weatherDatabase();
    const located = await weatherQuery(
      sql`
 SELECT s.key,coalesce(s.latitude,c.latitude) AS latitude,coalesce(s.longitude,c.longitude) AS longitude,m.code,m.name,m.source_version
 FROM jsonb_to_recordset(${sql.json(sites.slice(0, 72))}) AS s(key text,latitude float8,longitude float8,stop_id text)
 LEFT JOIN LATERAL (
 SELECT ST_Y(p.location::geometry) latitude,ST_X(p.location::geometry) longitude FROM canonical_place p JOIN place_external_identifier i ON p.id=i.place_id WHERE i.source_id||':'||i.external_id=s.stop_id AND i.source_id IN ('renfe','emt')
 UNION ALL SELECT cs.latitude,cs.longitude FROM crtm_stops cs JOIN crtm_feed f USING(dataset_id) WHERE f.enabled AND cs.dataset_id||':'||cs.external_id=s.stop_id
 ) c ON s.latitude IS NULL
 LEFT JOIN weather_municipality m ON ST_Covers(m.boundary,ST_SetSRID(ST_MakePoint(coalesce(s.longitude,c.longitude),coalesce(s.latitude,c.latitude)),4326))`,
      signal,
    );
    const mapped = sites.map((s) => {
      const matches = located.filter((r) => r.key === s.key);
      return {
        ...s,
        location: matches.length === 1 && matches[0]?.code ? matches[0] : null,
      };
    });
    const municipalities = [
      ...new Set(
        mapped.flatMap((s) => (s.location ? [String(s.location.code)] : [])),
      ),
    ].slice(0, 12);
    signal.throwIfAborted();
    const rows = municipalities.length
      ? await weatherProducts(
          [
            ...(product === "hourly_forecast" ? [] : ["warnings:28"]),
            ...(product === "warnings"
              ? []
              : municipalities.map((m) => `forecast:${m}`)),
          ],
          signal,
        )
      : [];
    const evidence: WeatherEvidence[] = rows.map((row) => ({
      key: row.resource,
      version: row.version,
      issuedAt: iso(row.issued_at),
      validFrom: iso(row.valid_from),
      validTo: iso(row.valid_to),
      fetchedAt: iso(row.fetched_at),
      checkedAt: iso(row.checked_at),
      freshness: weatherFreshness(
        row.resource === "warnings:28" ? "warnings" : "forecast",
        iso(row.checked_at),
        iso(row.issued_at),
        row.error_code,
      ),
      error: row.error_code,
    }));
    const payload = (key: string) =>
      evidence.find((e) => e.key === key)?.freshness !== "unavailable"
        ? (rows.find((r) => r.resource === key)?.payload as
            | WeatherProduct
            | undefined)
        : undefined;
    const warning = payload("warnings:28");
    const periodPool = new Map<
      string,
      { id: string; municipality: string; value: WeatherPeriod }
    >();
    const alertPool = new Map<
      string,
      { id: string; value: ReturnType<typeof selectWarnings>["alerts"][number] }
    >();
    const alternatives = routes.map((_r, alternative) => {
      const relevant = mapped.filter((s) => s.alternative === alternative);
      const summaries = relevant.map((s) => {
        if (!s.location || !municipalities.includes(String(s.location.code)))
          return { point: s.key, status: "location_unavailable" as const };
        const municipality = String(s.location.code),
          forecast = payload(`forecast:${municipality}`);
        const prediction =
          forecast?.product === "forecast"
            ? selectForecast(
                forecast,
                s.start,
                s.end,
                s.walk ? [{ start: s.start, end: s.end }] : [],
              )
            : null;
        const warnings =
          warning?.product === "warnings"
            ? selectWarnings(
                warning,
                {
                  latitude: Number(s.location.latitude),
                  longitude: Number(s.location.longitude),
                },
                s.start,
                s.end,
                evidence.find((e) => e.key === "warnings:28")?.freshness ===
                  "recently_checked",
              )
            : {
                zones: [],
                ambiguous: false,
                status: "unknown",
                alerts: [],
                truncated: false,
              };
        return {
          point: s.key,
          status: prediction?.coverage ?? "forecast_unavailable",
          municipality,
          name: s.location.name,
          validFrom: s.start,
          validTo: s.end,
          knownWalkingInterval: s.walk,
          evidenceKeys: evidence
            .filter(
              (e) =>
                e.key === `forecast:${municipality}` || e.key === "warnings:28",
            )
            .map((e) => e.key),
          prediction,
          warnings,
        };
      });
      const unique = [
        ...new Map(
          summaries.map((s) => [
            JSON.stringify(
              "municipality" in s
                ? [
                    s.municipality,
                    s.validFrom,
                    s.validTo,
                    s.knownWalkingInterval,
                    s.warnings,
                  ]
                : s,
            ),
            s,
          ]),
        ).values(),
      ];
      const relevance = weatherRelevance(
        unique.flatMap((s) =>
          s.municipality && s.warnings
            ? [
                {
                  municipality: s.municipality,
                  warnings: s.warnings,
                  precipitationOnFoot: s.prediction?.precipitationOnFoot ?? [],
                },
              ]
            : [],
        ),
      );
      return {
        alternative,
        points: unique.map((s) => {
          if (!s.municipality || !s.warnings) return s;
          const periodRef = (p: WeatherPeriod) => {
            const key = JSON.stringify([s.municipality, p]);
            let item = periodPool.get(key);
            if (!item && periodPool.size < 96) {
              item = {
                id: `p${periodPool.size}`,
                municipality: s.municipality,
                value: p,
              };
              periodPool.set(key, item);
            }
            return item?.id;
          };
          const periodRefs = (s.prediction?.periods ?? []).flatMap((p) => {
            const id = periodRef(p);
            return id ? [id] : [];
          });
          const walkingRefs = (s.prediction?.precipitationOnFoot ?? []).flatMap(
            (p) => {
              const id = periodRef(p);
              return id ? [id] : [];
            },
          );
          const alertRefs = s.warnings.alerts.flatMap((value) => {
            const key = JSON.stringify(value);
            let item = alertPool.get(key);
            if (!item && alertPool.size < 24) {
              item = { id: `a${alertPool.size}`, value };
              alertPool.set(key, item);
            }
            return item ? [item.id] : [];
          });
          const { prediction, warnings, ...metadata } = s;
          return {
            ...metadata,
            prediction: prediction
              ? {
                  coverage: prediction.coverage,
                  periodRefs,
                  precipitationOnFootRefs: walkingRefs,
                  truncated:
                    prediction.truncated ||
                    periodRefs.length < prediction.periods.length,
                }
              : null,
            warnings: {
              zones: warnings.zones,
              ambiguous: warnings.ambiguous,
              status: warnings.status,
              alertRefs,
              truncated:
                warnings.truncated || alertRefs.length < warnings.alerts.length,
            },
          };
        }),
        relevanceKey: createHash("sha256").update(relevance).digest("hex"),
      };
    });
    return {
      status: "evaluated",
      asOf: new Date().toISOString(),
      attribution:
        "Fuente: AEMET; límites municipales IGN. Selección contextual propia.",
      evidence,
      alternatives,
      periods: [...periodPool.values()],
      alerts: [...alertPool.values()],
      coverage: {
        municipalities,
        boundaryVersions: [
          ...new Set(
            located.flatMap((r) =>
              r.source_version ? [r.source_version] : [],
            ),
          ),
        ],
        unknownPoints: mapped.filter((s) => !s.location).length,
        pointsTruncated: sites.length > 72,
        scope:
          "Origin, destination and located leg endpoints/transfers only; municipal-capital forecast and coarse CAP polygons, not continuous route weather. Waiting outdoors is not inferred.",
      },
      limitations: [
        "Past evidence is not live. A fresh check does not extend original validity. Probability/accumulation intervals are not probabilities for a few walking minutes. Weather does not imply transport disruption.",
      ],
    };
  } catch {
    return {
      status: "unavailable",
      reason: "weather_enrichment_unavailable",
      attribution: "AEMET",
      evidence: [],
      alternatives: [],
    };
  }
}
