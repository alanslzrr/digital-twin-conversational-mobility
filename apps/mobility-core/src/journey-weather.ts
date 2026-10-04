import { createHash } from "node:crypto";
import type {
  WeatherEvidence,
  WeatherPeriod,
  WeatherProduct,
} from "@mobility/contracts";
import { selectWarnings, weatherRelevance } from "@mobility/domain";
import { weatherFreshness } from "@mobility/provenance";
import { weatherDatabase } from "./database";
import { boundedSignal } from "./execution-signal";
import { readWeatherProducts, weatherProducts } from "./weather-cache";
import { weatherQuery } from "./weather-query";
import { chooseWeather } from "./weather-selection";

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
  product?: "hourly_forecast" | "daily_forecast" | "warnings",
  refresh = true,
) {
  const signal = boundedSignal(AbortSignal.timeout(2000));
  try {
    const sites: Site[] = [];
    for (const [alternative, r] of routes.entries()) {
      if (product === undefined)
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
    const mapped = sites.slice(0, 72).map((s) => {
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
    const cached = await readWeatherProducts(
      municipalities
        .flatMap((m) =>
          product === "warnings"
            ? []
            : product === "hourly_forecast"
              ? [`forecast:${m}`]
              : product === "daily_forecast"
                ? [`daily:${m}`]
                : [`forecast:${m}`, `daily:${m}`],
        )
        .concat(
          municipalities.length && (!product || product === "warnings")
            ? ["warnings:28"]
            : [],
        ),
      signal,
    );
    const needed = new Set<string>();
    if (municipalities.length && (!product || product === "warnings"))
      needed.add("warnings:28");
    for (const site of mapped) {
      const municipality = String(site.location?.code ?? "");
      if (!municipalities.includes(municipality) || product === "warnings")
        continue;
      if (product) {
        needed.add(
          `${product === "daily_forecast" ? "daily" : "forecast"}:${municipality}`,
        );
        continue;
      }
      const hourlyRow = cached.find(
        (r) => r.resource === `forecast:${municipality}`,
      );
      const hourly = hourlyRow?.payload;
      const choice = chooseWeather(
        cached,
        municipality,
        site.start,
        site.end,
        [],
      );
      if (
        choice?.product === "forecast" &&
        choice.freshness === "recently_checked" &&
        choice.prediction.coverage === "covered"
      ) {
        needed.add(`forecast:${municipality}`);
      } else {
        const outside =
          hourly?.product === "forecast" &&
          (Date.parse(site.start) < Date.parse(hourly.validFrom) ||
            Date.parse(site.end) > Date.parse(hourly.validTo));
        // A known missing horizon suppresses demand until the normal review is
        // due; a route never forces a download of an existing payload.
        if (
          !outside ||
          (hourlyRow && new Date(hourlyRow.next_due_at).getTime() <= Date.now())
        )
          needed.add(`forecast:${municipality}`);
        needed.add(`daily:${municipality}`);
      }
    }
    // One shared signal and one acquisition for all alternatives/products. Cached
    // products not demanded remain eligible for comparison without refreshing them.
    const refreshed =
      refresh && needed.size ? await weatherProducts([...needed], signal) : [];
    const rows = [
      ...new Map(
        [...cached, ...refreshed].map((row) => [row.resource, row]),
      ).values(),
    ].sort((a, b) => a.resource.localeCompare(b.resource));
    const evidence: WeatherEvidence[] = rows.map((row) => ({
      key: row.resource,
      version: row.version,
      issuedAt:
        row.payload?.product === "daily_forecast" ? null : iso(row.issued_at),
      ...(row.payload?.product === "daily_forecast"
        ? {
            issuedAtRaw: row.payload.issuedAtRaw,
            invalidFields: row.payload.invalidFields,
            issueTimeZone: row.payload.issueTimeZone,
            ageBasis: row.payload.ageBasis,
            ageBasisInterpretation: row.payload.ageBasisInterpretation,
          }
        : {}),
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
      {
        id: string;
        municipality: string;
        product: string | null;
        version: string | null;
        value: WeatherPeriod;
      }
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
        const municipality = String(s.location.code);
        const choice = chooseWeather(
          rows,
          municipality,
          s.start,
          s.end,
          s.walk ? [{ start: s.start, end: s.end }] : [],
          product,
        );
        const prediction = choice?.prediction ?? null;
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
        // A shorter product cannot explain absence when another relevant
        // forecast overlaps the query but is unusable (for example, expired).
        const forecasts = rows.flatMap(({ payload }) =>
          payload &&
          payload.product !== "warnings" &&
          payload.municipality === municipality &&
          product !== "warnings" &&
          (product !== "hourly_forecast" || payload.product === "forecast") &&
          (product !== "daily_forecast" || payload.product === "daily_forecast")
            ? [payload]
            : [],
        );
        return {
          point: s.key,
          status:
            prediction?.coverage ??
            (forecasts.length > 0 &&
            forecasts.every(
              (forecast) =>
                Date.parse(s.end) <= Date.parse(forecast.validFrom) ||
                Date.parse(s.start) >= Date.parse(forecast.validTo),
            )
              ? "outside_horizon"
              : "forecast_unavailable"),
          municipality,
          name: s.location.name,
          validFrom: s.start,
          validTo: s.end,
          knownWalkingInterval: s.walk,
          evidenceKeys: evidence
            .filter(
              (e) => e.key === choice?.resource || e.key === "warnings:28",
            )
            .map((e) => e.key),
          product: choice?.product ?? null,
          freshness: choice?.freshness ?? "unavailable",
          dailyReason: choice?.reason ?? null,
          version: choice?.version ?? null,
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
                  context: [
                    s.product,
                    s.freshness,
                    s.prediction?.coverage,
                    s.prediction && "resolutions" in s.prediction
                      ? s.prediction.resolutions
                      : [1],
                  ],
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
            const key = JSON.stringify([
              s.municipality,
              s.product,
              s.version,
              p,
            ]);
            let item = periodPool.get(key);
            if (!item && periodPool.size < 96) {
              item = {
                id: `p${periodPool.size}`,
                municipality: s.municipality,
                product: s.product,
                version: s.version,
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
                  ...("extremes" in prediction
                    ? {
                        extremes: prediction.extremes,
                        resolutions: prediction.resolutions,
                        skyCoverage: prediction.skyCoverage,
                      }
                    : { resolutions: [1] }),
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
        unknownPoints:
          sites.length -
          mapped.length +
          mapped.filter((s) => !s.location).length,
        pointsTruncated: sites.length > 72,
        scope:
          "Origin, destination and located leg endpoints/transfers only; municipal-capital forecast and coarse CAP polygons, not continuous route weather. Waiting outdoors is not inferred.",
      },
      limitations: [
        "Daily extrema refer to the published UTC date, not departure temperature. Daily periods retain 6/12/24-hour resolution; issue time without a zone is not an exact confirmed instant.",
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
