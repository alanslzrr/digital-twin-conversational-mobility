const products: Record<string, string> = {
  bicimad: "Bicicletas BiciMAD",
  "madrid-parking": "Ocupación de aparcamientos",
  "madrid-traffic": "Sensores de tráfico",
  "madrid-air": "Calidad del aire",
  aemet: "Observaciones meteorológicas",
  "renfe-trips": "Estimaciones Renfe",
  "renfe-alerts": "Avisos Renfe",
  "emt-alerts": "Avisos EMT",
  "dgt-incidents": "Incidencias de carreteras",
  "reference:places": "Lugares publicados",
  "reference:lines": "Líneas publicadas",
  "reference:timetables": "Horarios de referencia",
  "reference:accessibility": "Accesibilidad declarada",
  "reference:tariffs": "Tarifas documentales",
  "reference:geography": "Geografía municipal",
};
export function productLabel(id: string) {
  return (
    products[id] ??
    (id.startsWith("weather:daily:")
      ? "Predicción diaria"
      : id.startsWith("weather:warnings:")
        ? "Avisos meteorológicos"
        : id.startsWith("weather:")
          ? "Predicción horaria"
          : id.startsWith("emt:")
            ? "Llegadas EMT"
            : id.startsWith("crtm:")
              ? "Catálogo de transporte CRTM"
              : "Información publicada")
  );
}
export function evidenceExplanation(reason: string | null, coverage: string) {
  const reasons: Record<string, string> = {
    missing_observation:
      "La fuente no publicó una hora de observación verificable.",
    invalid_timestamp: "Fecha publicada no utilizable.",
    future_observation: "Hora de observación fuera del margen permitido.",
    last_refresh_failed:
      "El último intento falló; se conserva la lectura anterior.",
    old_issue:
      "La publicación es demasiado antigua, aunque se haya comprobado recientemente.",
    outside_horizon: "El periodo publicado ya ha terminado.",
  };
  return reason
    ? (reasons[reason] ??
        "La evidencia tiene limitaciones; consulta las fechas del detalle.")
    : coverage === "partial"
      ? "Cobertura publicada parcial; no representa toda la ciudad."
      : coverage === "complete"
        ? "Completa para esta selección, no garantía de disponibilidad."
        : "No se dispone de evidencia suficiente para esta selección.";
}
export function measurementValue(name: string, value: unknown) {
  if (
    ["arrivalSeconds", "departureSeconds"].includes(name) &&
    typeof value === "number"
  ) {
    const hours = Math.floor(value / 3600),
      minutes = Math.floor((value % 3600) / 60);
    return `${String(hours % 24).padStart(2, "0")}:${String(minutes).padStart(2, "0")}${hours >= 24 ? " (día siguiente del servicio)" : ""}`;
  }
  if (name === "wheelchair")
    return value === 1 || value === "1"
      ? "Accesibilidad declarada"
      : value === 2 || value === "2"
        ? "No accesible según declaración"
        : "Sin declaración verificable";
  if (name === "kind")
    return (
      (
        {
          stop: "Parada",
          station: "Estación",
          entrance: "Acceso",
          address: "Dirección",
          poi: "Lugar de interés",
        } as Record<string, string>
      )[String(value)] ?? "Tipo publicado por la fuente"
    );
  const values: Record<string, string> = {
    instant: "Medida instantánea",
    interval: "Acumulada durante el periodo",
    active: "Vigente según la fuente",
    unknown: "No confirmado",
    inactive: "No vigente",
    provisional: "Provisional",
    validated: "Validada",
  };
  return typeof value === "string" &&
    ["basis", "providerValidity", "quality", "status"].includes(name)
    ? (values[value] ?? "Clasificación publicada; detalle técnico disponible")
    : String(value);
}

/** Human-readable measurements, shared by list, detail and map summaries. */
export function measurementDisplay(
  name: string,
  value: unknown,
  unit?: string | null,
) {
  if (value === null || value === undefined) return "Sin dato";
  const coded = ["wheelchair", "arrivalSeconds", "departureSeconds"].includes(
    name,
  );
  const formatted = coded
    ? measurementValue(name, value)
    : typeof value === "number"
      ? new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(
          value,
        )
      : typeof value === "boolean"
        ? value
          ? "Sí"
          : "No"
        : measurementValue(name, value);
  return unit && !coded ? `${formatted} ${unit}` : formatted;
}
