export const eventTypes: Record<string, string> = {
  publication: "Información guardada",
  refresh: "Consulta de actualización",
  lease_lost: "Reserva de trabajo perdida",
  lease_recovered: "Reserva recuperada",
  release: "Trabajo liberado",
};
export const eventOutcomes: Record<string, string> = {
  success: "Completado",
  historical_only: "Guardado solo en histórico",
  error: "No completado",
  lease_lost: "Sin reserva válida",
  storage_error: "Error al guardar",
};
export const eventComponents: Record<string, string> = {
  ingestion: "Actualización periódica",
  weather: "Meteorología",
  emt: "Llegadas EMT",
  geocoder: "Búsqueda de lugares",
  routing: "Planificación de trayectos",
};
export const severityCopy: Record<string, string> = {
  info: "Información",
  warning: "Advertencia",
  error: "Error",
};
