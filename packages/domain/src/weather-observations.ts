import type { WeatherReading, WeatherStation } from "@mobility/contracts";
import { getFreshness } from "@mobility/provenance";
export function weatherStationDistance(
  point: { latitude: number; longitude: number },
  station: WeatherStation,
) {
  const rad = Math.PI / 180,
    a =
      Math.sin(((station.latitude - point.latitude) * rad) / 2) ** 2 +
      Math.cos(point.latitude * rad) *
        Math.cos(station.latitude * rad) *
        Math.sin(((station.longitude - point.longitude) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
export function selectObservedStation(
  stations: readonly WeatherStation[],
  readings: WeatherReading[],
  point: { latitude: number; longitude: number },
  now = new Date(),
) {
  const byId = new Map(readings.map((r) => [r.stationId, r]));
  const nearby = stations
    .map((station) => ({
      station,
      distanceMeters: weatherStationDistance(point, station),
      reading: byId.get(station.id),
    }))
    .filter((s) => s.distanceMeters <= 20000)
    .sort(
      (a, b) =>
        a.distanceMeters - b.distanceMeters ||
        a.station.id.localeCompare(b.station.id),
    );
  const withReadings = nearby.filter((s) => s.reading);
  const fresh = withReadings.filter(
    (s) =>
      getFreshness(s.reading?.provenance ?? null, 7200, now).status === "fresh",
  );
  const selected =
    fresh[0] ??
    withReadings.find(
      (s) =>
        getFreshness(s.reading?.provenance ?? null, 7200, now).status ===
        "stale",
    );
  return {
    selected,
    reason: selected
      ? fresh.length
        ? "nearest_fresh_observation"
        : "nearest_stale_observation"
      : nearby.length
        ? "nearby_stations_without_observation"
        : "no_station_within_radius",
    radiusMeters: 20000,
    stationsWithinRadius: nearby.length,
    withReadings: withReadings.length,
    fresh: fresh.length,
  };
}
