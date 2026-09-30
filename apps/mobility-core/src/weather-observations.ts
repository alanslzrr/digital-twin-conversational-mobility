import type { Provenance, WeatherReading } from "@mobility/contracts";
import { selectObservedStation } from "@mobility/domain";
import { entityObservation } from "@mobility/provenance";
import {
  weatherStationCatalogEvidence,
  weatherStationCatalogVersion,
  weatherStations,
} from "./catalogs/weather-stations";

export function stableWeatherJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
}
export function mergeWeatherReadings(
  previous: WeatherReading[],
  incoming: WeatherReading[],
  collection: Provenance,
  previousCollection?: Provenance,
) {
  const scientific = (r: WeatherReading) =>
    stableWeatherJson([
      r.stationId,
      r.name,
      r.latitude,
      r.longitude,
      r.altitudeMeters ?? null,
      r.observedAt,
      r.measurements,
    ]);
  const merged = new Map(
    previous.map((r) => [
      r.stationId,
      {
        ...r,
        provenance:
          r.provenance ??
          (previousCollection
            ? { ...previousCollection, observedAt: r.observedAt }
            : undefined),
      },
    ]),
  );
  for (const reading of incoming) {
    const before = merged.get(reading.stationId);
    if (
      before &&
      (Date.parse(before.observedAt) > Date.parse(reading.observedAt) ||
        scientific(before) === scientific(reading))
    )
      continue;
    merged.set(reading.stationId, {
      ...reading,
      provenance: { ...collection, observedAt: reading.observedAt },
    });
  }
  return [...merged.values()].sort((a, b) =>
    a.stationId.localeCompare(b.stationId),
  );
}
export function weatherObservationCoverage(readings: WeatherReading[]) {
  return {
    scope: "initial_madrid_station_catalog",
    catalogVersion: weatherStationCatalogVersion,
    knownStations: weatherStations.length,
    retainedStations: weatherStations.filter((s) =>
      readings.some((r) => r.stationId === s.id),
    ).length,
    missingStationIds: weatherStations
      .filter((s) => !readings.some((r) => r.stationId === s.id))
      .map((s) => s.id),
    complete: false,
  };
}
export function observationResult(
  readings: WeatherReading[],
  collection: Provenance | null,
  selector: {
    stationId?: string | undefined;
    point?: { latitude: number; longitude: number } | undefined;
    fromTime?: string | undefined;
    toTime?: string | undefined;
  },
  now = new Date(),
) {
  const decorated = readings.map((r) => ({
    ...r,
    provenance:
      r.provenance ??
      (collection ? { ...collection, observedAt: r.observedAt } : undefined),
  }));
  const eligible = decorated.filter(
    (r) =>
      (!selector.fromTime ||
        Date.parse(r.observedAt) >= Date.parse(selector.fromTime)) &&
      (!selector.toTime ||
        Date.parse(r.observedAt) < Date.parse(selector.toTime)),
  );
  const coverage = {
    ...weatherObservationCoverage(decorated),
    catalogEvidence: weatherStationCatalogEvidence,
    maxAgeSeconds: 7200,
  };
  let station = weatherStations.find(
      (s) => s.id === (selector.stationId ?? "3195"),
    ),
    reading: WeatherReading | undefined;
  let selection: {
    reason: string;
    distanceMeters?: number | undefined;
    radiusMeters?: number;
    stationsWithinRadius?: number;
    withReadings?: number;
    fresh?: number;
  } = {
    reason: selector.stationId
      ? "exact_station"
      : "compatibility_default_retiro",
  };
  if (selector.point) {
    const result = selectObservedStation(
      weatherStations,
      eligible,
      selector.point,
      now,
    );
    station = result.selected?.station;
    reading = result.selected?.reading;
    selection = {
      reason: result.reason,
      distanceMeters: result.selected?.distanceMeters,
      radiusMeters: result.radiusMeters,
      stationsWithinRadius: result.stationsWithinRadius,
      withReadings: result.withReadings,
      fresh: result.fresh,
    };
  } else reading = eligible.find((r) => r.stationId === station?.id);
  if (!station || !reading)
    return {
      status: "unavailable",
      reason: selector.point
        ? selection.reason
        : selector.stationId && !station
          ? "unknown_weather_station"
          : selector.fromTime || selector.toTime
            ? "no_stored_observation_in_interval"
            : "known_station_without_observation",
      station: station ?? null,
      selection,
      readings: [],
      coverage,
    };
  const provenance = reading.provenance ?? null;
  const observation = provenance
    ? entityObservation(provenance, reading.observedAt, 7200, now)
    : {
        provenance: null,
        freshness: { status: "unavailable" as const, ageSeconds: null },
      };
  return {
    status: "available",
    provenance: collection,
    provenanceScope: "collection_only",
    readings: [
      {
        ...reading,
        ...observation,
        station: { ...station, catalogVersion: weatherStationCatalogVersion },
        measurements: reading.measurements.map((m) => ({
          ...m,
          validFrom: new Date(
            Date.parse(reading.observedAt) - m.periodMinutes * 60000,
          ).toISOString(),
          validTo: reading.observedAt,
          basis: m.periodMinutes ? "interval" : "instant",
        })),
      },
    ],
    selection,
    coverage,
    attribution: "Fuente: AEMET",
    limitations: [
      "Observations at a station, not conditions in a street or continuous local weather. 20 km is a product search limit, not a representativeness guarantee.",
      "Precipitation covers the preceding 60 minutes; mean wind the preceding 10 minutes; maximum gust is a three-second maximum over the preceding 60 minutes. Units are those of the API.",
      "Only the latest retained observation per station is indexed here; no interpolation or historical reconstruction.",
    ],
  };
}
