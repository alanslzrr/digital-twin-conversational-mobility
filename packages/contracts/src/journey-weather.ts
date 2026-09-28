export type WeatherPeriod = {
  kind:
    | "temperature"
    | "precipitation"
    | "precipitation_probability"
    | "storm_probability"
    | "snow_probability"
    | "snow"
    | "wind"
    | "gust"
    | "sky";
  validFrom: string;
  validTo: string;
  value: number | string;
  unit: string;
  period: string;
  basis: "interval" | "instant";
};
export type MunicipalForecast = {
  product: "forecast";
  municipality: string;
  name: string;
  issuedAt: string;
  validFrom: string;
  validTo: string;
  periods: WeatherPeriod[];
  timeZone: "Europe/Madrid";
  omittedAmbiguousPeriods: number;
};
export type WeatherAlert = {
  id: string;
  sent: string;
  references: string[];
  messageType: "Alert" | "Update" | "Cancel";
  phenomenon: string;
  severity: string;
  level: string;
  event: string;
  validFrom: string;
  validTo: string;
  areas: { code: string; name: string; polygons: number[][][] }[];
};
export type MadridWarnings = {
  product: "warnings";
  issuedAt: string;
  validFrom: string;
  validTo: string;
  records: WeatherAlert[];
};
export type WeatherProduct = MunicipalForecast | MadridWarnings;
export type WeatherEvidence = {
  key: string;
  version: string | null;
  issuedAt: string | null;
  validFrom: string | null;
  validTo: string | null;
  fetchedAt: string | null;
  checkedAt: string | null;
  freshness: "recently_checked" | "stale" | "unavailable";
  error: string | null;
};
