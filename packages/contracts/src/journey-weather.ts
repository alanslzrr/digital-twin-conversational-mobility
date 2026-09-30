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
export type DailyForecast = {
  product: "daily_forecast";
  municipality: string;
  name: string;
  issuedAt: null;
  issuedAtRaw: string;
  issueTimeZone: "unspecified";
  ageBasis: string;
  ageBasisInterpretation: "earliest_utc_or_madrid";
  validFrom: string;
  validTo: string;
  periods: DailyWeatherPeriod[];
  extremes: {
    date: string;
    minimum: number | null;
    maximum: number | null;
    unit: "°C";
  }[];
  invalidFields: number;
};
export type DailyWeatherPeriod = WeatherPeriod & {
  date: string;
  originalPeriod: string | null;
  description?: string;
  resolutionHours: 6 | 12 | 24;
};
export type WeatherProduct = MunicipalForecast | MadridWarnings | DailyForecast;
export type WeatherEvidence = {
  key: string;
  issuedAtRaw?: string;
  issueTimeZone?: "unspecified";
  ageBasis?: string;
  invalidFields?: number;
  ageBasisInterpretation?: "earliest_utc_or_madrid";
  version: string | null;
  issuedAt: string | null;
  validFrom: string | null;
  validTo: string | null;
  fetchedAt: string | null;
  checkedAt: string | null;
  freshness: "recently_checked" | "stale" | "unavailable";
  error: string | null;
};
