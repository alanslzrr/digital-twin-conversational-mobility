const products: Record<string, string> = {
  bicimad: "BiciMAD bikes",
  "madrid-parking": "Parking occupancy",
  "madrid-traffic": "Traffic sensors",
  "madrid-air": "Air quality",
  "weather:daily": "Daily forecast",
  "weather:forecast": "Hourly forecast",
  "weather:warnings": "Weather warnings",
  "emt:arrivals": "EMT arrivals",
  aemet: "Weather observations",
  "renfe-trips": "Renfe estimates",
  "renfe-alerts": "Renfe alerts",
  "emt-alerts": "EMT alerts",
  "dgt-incidents": "Road incidents",
  "reference:places": "Published places",
  "reference:lines": "Published lines",
  "reference:timetables": "Reference timetables",
  "reference:accessibility": "Declared accessibility",
  "reference:tariffs": "Documentary fares",
  "reference:geography": "Municipal geography",
};
export function productLabel(id: string) {
  return (
    products[id] ??
    (id.startsWith("weather:daily:")
      ? "Daily forecast"
      : id.startsWith("weather:warnings:")
        ? "Weather warnings"
        : id.startsWith("weather:")
          ? "Hourly forecast"
          : id.startsWith("emt:")
            ? "EMT arrivals"
            : id.startsWith("crtm:")
              ? "CRTM transport catalog"
              : "Published information")
  );
}
export function evidenceExplanation(reason: string | null, coverage: string) {
  const reasons: Record<string, string> = {
    missing_observation: "Source supplied no verifiable observation time.",
    invalid_timestamp: "Published time unusable.",
    future_observation: "Observation time outside permitted margin.",
    last_refresh_failed: "Last attempt failed; previous observation retained.",
    old_issue: "Publication is stale despite a recent check.",
    outside_horizon: "Published interval ended.",
  };
  return reason
    ? (reasons[reason] ?? "Evidence has limits; inspect detailed times.")
    : coverage === "partial"
      ? "Partial published coverage, not citywide coverage."
      : coverage === "complete"
        ? "Complete for this selection, not an availability guarantee."
        : "Insufficient evidence for this selection.";
}
export function measurementValue(name: string, value: unknown) {
  if (
    ["arrivalSeconds", "departureSeconds"].includes(name) &&
    typeof value === "number"
  ) {
    const hours = Math.floor(value / 3600),
      minutes = Math.floor((value % 3600) / 60);
    return `${String(hours % 24).padStart(2, "0")}:${String(minutes).padStart(2, "0")}${hours >= 24 ? " (next service day)" : ""}`;
  }
  if (name === "wheelchair")
    return value === 1 || value === "1"
      ? "Declared accessibility"
      : value === 2 || value === "2"
        ? "Not accessible as declared"
        : "No verifiable declaration";
  if (name === "kind")
    return (
      (
        {
          stop: "Stop",
          station: "Station",
          entrance: "Entrance",
          address: "Address",
          poi: "Point of interest",
        } as Record<string, string>
      )[String(value)] ?? "Published source type"
    );
  const values: Record<string, string> = {
    instant: "Instant measurement",
    interval: "Accumulated over the period",
    active: "Active as published",
    unknown: "Unknown",
    inactive: "Inactive",
    provisional: "Provisional",
    validated: "Validated",
  };
  return typeof value === "string" &&
    ["basis", "providerValidity", "quality", "status"].includes(name)
    ? (values[value] ?? "Published classification; technical details available")
    : String(value);
}

/** Human-readable measurements, shared by list, detail and map summaries. */
export function measurementDisplay(
  name: string,
  value: unknown,
  unit?: string | null,
) {
  if (value === null || value === undefined) return "Unknown";
  const coded = ["wheelchair", "arrivalSeconds", "departureSeconds"].includes(
    name,
  );
  const formatted = coded
    ? measurementValue(name, value)
    : typeof value === "number"
      ? new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(
          value,
        )
      : typeof value === "boolean"
        ? value
          ? "Yes"
          : "No"
        : measurementValue(name, value);
  return unit && !coded ? `${formatted} ${unit}` : formatted;
}

export function productUnit(unit: string) {
  return (
    (
      {
        estaciones: "stations",
        medidas: "measurements",
        registros: "records",
        "muestras por categoría": "category samples",
        "recursos consultados": "queried resources",
      } as Record<string, string>
    )[unit] ?? unit
  );
}
