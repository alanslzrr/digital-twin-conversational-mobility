import type {
  MadridWarnings,
  MunicipalForecast,
  WeatherPeriod,
} from "@mobility/contracts";
export type WeatherPoint = { latitude: number; longitude: number };
export function weatherOverlaps(
  from: string,
  to: string,
  start: string,
  end: string,
) {
  return Date.parse(from) === Date.parse(to)
    ? Date.parse(from) >= Date.parse(start) &&
        Date.parse(from) <= Date.parse(end)
    : Date.parse(from) < Date.parse(end) && Date.parse(to) > Date.parse(start);
}
export function weatherCovers(
  intervals: { validFrom: string; validTo: string }[],
  start: string,
  end: string,
) {
  let cursor = Date.parse(start);
  for (const p of [...intervals].sort(
    (a, b) => Date.parse(a.validFrom) - Date.parse(b.validFrom),
  )) {
    if (Date.parse(p.validFrom) > cursor) break;
    if (Date.parse(p.validTo) > cursor) cursor = Date.parse(p.validTo);
  }
  return cursor >= Date.parse(end);
}
// CAP polygons are official coarse area outlines, not a street-level hazard map.
export function polygonContains(
  point: WeatherPoint,
  polygon: number[][],
): "inside" | "boundary" | "outside" {
  const x = point.longitude,
    y = point.latitude;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (!a || !b) continue;
    const ax = a[0] ?? NaN,
      ay = a[1] ?? NaN,
      bx = b[0] ?? NaN,
      by = b[1] ?? NaN;
    if (
      Math.abs((x - ax) * (by - ay) - (y - ay) * (bx - ax)) < 1e-10 &&
      x >= Math.min(ax, bx) &&
      x <= Math.max(ax, bx) &&
      y >= Math.min(ay, by) &&
      y <= Math.max(ay, by)
    )
      return "boundary";
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
      inside = !inside;
  }
  return inside ? "inside" : "outside";
}
export function selectForecast(
  product: MunicipalForecast,
  start: string,
  end: string,
  walks: { start: string; end: string }[],
) {
  const selected = product.periods.filter((p) =>
    weatherOverlaps(p.validFrom, p.validTo, start, end),
  );
  const precipitationOnFoot = selected.filter(
    (p) =>
      (p.kind === "precipitation" || p.kind === "precipitation_probability") &&
      (p.value === "Ip" || (typeof p.value === "number" && p.value > 0)) &&
      walks.some((w) =>
        weatherOverlaps(p.validFrom, p.validTo, w.start, w.end),
      ),
  );
  return {
    coverage: weatherCovers(
      product.periods.filter((p) => p.kind === "precipitation"),
      start,
      end,
    )
      ? "covered"
      : selected.length
        ? "partial"
        : "outside_horizon",
    periods: selected.slice(0, 80),
    truncated: selected.length > 80,
    precipitationOnFoot: precipitationOnFoot.slice(0, 24),
  };
}
const phenomena = ["AT", "BT", "NE", "NI", "PR", "TO", "VI", "VS"];
export function selectWarnings(
  product: MadridWarnings,
  point: WeatherPoint,
  start: string,
  end: string,
  recent: boolean,
) {
  const areas = new Map<string, boolean>();
  for (const r of product.records)
    for (const a of r.areas)
      for (const p of a.polygons) {
        const relation = polygonContains(point, p);
        if (relation !== "outside")
          areas.set(
            a.code,
            (areas.get(a.code) ?? false) || relation === "boundary",
          );
      }
  const zones = [...areas.keys()];
  const ambiguous = zones.length !== 1 || [...areas.values()].some(Boolean);
  const scoped = product.records.filter(
    (r) =>
      r.areas.some((a) => zones.includes(a.code)) &&
      weatherOverlaps(r.validFrom, r.validTo, start, end),
  );
  const alerts = scoped.filter(
    (r) =>
      r.severity !== "Minor" && Date.parse(r.validTo) > Date.parse(r.validFrom),
  );
  const complete =
    !ambiguous &&
    phenomena.every((code) =>
      weatherCovers(
        scoped.filter((r) => r.phenomenon === code),
        start,
        end,
      ),
    );
  return {
    zones,
    ambiguous,
    status: ambiguous
      ? "ambiguous_area"
      : alerts.length
        ? "warnings_apply"
        : recent && complete
          ? "no_applicable_warnings"
          : "unknown",
    alerts: alerts.slice(0, 16).map((r) => ({
      phenomenon: r.phenomenon,
      severity: r.severity,
      level: r.level,
      event: r.event,
      validFrom: r.validFrom,
      validTo: r.validTo,
    })),
    truncated: alerts.length > 16,
  };
}
// Excludes issue/ID changes and minor numeric fluctuations; preserves hazard periods and scope.
export function weatherRelevance(
  areas: {
    municipality: string;
    warnings: ReturnType<typeof selectWarnings>;
    precipitationOnFoot: WeatherPeriod[];
  }[],
) {
  return JSON.stringify(
    areas
      .map((a) => ({
        municipality: a.municipality,
        zones: [...a.warnings.zones].sort(),
        status: a.warnings.status,
        warnings: a.warnings.alerts
          .map((w) => [
            w.phenomenon,
            w.severity,
            w.level,
            w.validFrom,
            w.validTo,
          ])
          .sort(),
        precipitation: a.precipitationOnFoot
          .map((p) => [p.kind, p.validFrom, p.validTo])
          .sort(),
      }))
      .sort((a, b) => a.municipality.localeCompare(b.municipality)),
  );
}
