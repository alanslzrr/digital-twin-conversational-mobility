import type { Provenance } from "./index";
export type WeatherStation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  evidence: {
    inventory: boolean;
    observations: boolean;
    coordinateSource: "observations" | "inventory";
  };
};
export type WeatherReading = {
  stationId: string;
  name: string;
  latitude: number;
  longitude: number;
  altitudeMeters?: number | null;
  observedAt: string;
  measurements: {
    name: string;
    value: number;
    unit: string;
    periodMinutes: number;
  }[];
  provenance?: Provenance | undefined;
};
