export const sourceNames: Record<string, string> = {
  bicimad: "BiciMAD",
  aemet: "AEMET",
  emt: "EMT buses",
  renfe: "Renfe",
  crtm: "CRTM transport",
  dgt: "Roads DGT",
  "madrid-air": "Madrid air quality",
  "madrid-traffic": "Madrid traffic sensors",
  "madrid-parking": "Madrid parking",
  osm: "OpenStreetMap geography",
};
export const eventTypes: Record<string, string> = {
  publication: "Information stored",
  refresh: "Refresh attempt",
  lease_lost: "Worker lease lost",
  lease_recovered: "Lease recovered",
  release: "Work released",
};
export const eventOutcomes: Record<string, string> = {
  success: "Completed",
  historical_only: "Historical only",
  error: "Failed",
  lease_lost: "No valid lease",
  storage_error: "Storage error",
};
export const outcomeTones: Record<string, "neutral" | "warning" | "danger"> = {
  success: "neutral",
  historical_only: "warning",
  error: "danger",
  lease_lost: "warning",
  storage_error: "danger",
};
export const eventComponents: Record<string, string> = {
  ingestion: "Periodic capture",
  weather: "Weather",
  emt: "EMT arrivals",
  geocoder: "Place lookup",
  routing: "Journey planning",
};
export const severityCopy: Record<string, string> = {
  info: "Information",
  warning: "Warning",
  error: "Error",
};
