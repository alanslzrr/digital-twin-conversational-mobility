import type { Provenance, WeatherReading } from "@mobility/contracts";
import { selectObservedStation } from "@mobility/domain";
import { describe, expect, it } from "vitest";
import { weatherStations } from "./catalogs/weather-stations";
import {
  mergeWeatherReadings,
  observationResult,
} from "./weather-observations";

const now = new Date("2026-09-30T12:00:00Z");
const provenance: Provenance = {
  source: "aemet",
  observedAt: "2026-09-30T11:00:00Z",
  ingestedAt: "2026-09-30T11:05:00Z",
  quality: "provisional",
  rawReference: "sha256:first",
};
function reading(
  id = "3195",
  observedAt = provenance.observedAt,
): WeatherReading {
  const station = weatherStations.find((s) => s.id === id);
  if (!station) throw new Error("fixture station missing");
  return {
    stationId: id,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    altitudeMeters: station.altitudeMeters,
    observedAt,
    measurements: [
      { name: "precipitation", value: 0, unit: "mm", periodMinutes: 60 },
    ],
    provenance: { ...provenance, observedAt },
  };
}
describe("regional observations", () => {
  it("retains 25 evidenced identities including non-inventory and mountain stations", () => {
    expect(weatherStations).toHaveLength(25);
    for (const id of ["2462", "3121F", "3129A"])
      expect(weatherStations.some((s) => s.id === id)).toBe(true);
  });
  it("keeps ingestion provenance for identical retries", () => {
    const r = reading();
    expect(
      mergeWeatherReadings([r], [r], {
        ...provenance,
        ingestedAt: now.toISOString(),
      })[0]?.provenance,
    ).toEqual(provenance);
  });
  it("rejects station regressions while accepting independent older station updates", () => {
    const recent = reading();
    const other = reading("3100B", "2026-09-30T08:00:00Z");
    const merged = mergeWeatherReadings(
      [recent, other],
      [
        reading("3195", "2026-09-30T10:00:00Z"),
        reading("3100B", "2026-09-30T09:00:00Z"),
      ],
      provenance,
    );
    expect(merged.find((r) => r.stationId === "3195")?.observedAt).toBe(
      recent.observedAt,
    );
    expect(merged.find((r) => r.stationId === "3100B")?.observedAt).toBe(
      "2026-09-30T09:00:00Z",
    );
  });
  it("allows corrections and does not fill absent fields from another hour", () => {
    const correction = { ...reading(), measurements: [] };
    expect(
      mergeWeatherReadings([reading()], [correction], provenance)[0]
        ?.measurements,
    ).toEqual([]);
  });
  it("retains absent stations and marks freshness separately", () => {
    const stale = reading("3100B", "2026-09-30T06:00:00Z");
    const merged = mergeWeatherReadings([stale], [reading()], provenance);
    const result = observationResult(
      merged,
      provenance,
      { stationId: "3100B" },
      now,
    );
    expect(result.readings[0]?.freshness.status).toBe("stale");
    expect(result.readings[0]?.provenance?.observedAt).toBe(stale.observedAt);
  });
  it("explicitly defaults to Retiro and preserves zero and interval", () => {
    const result = observationResult([reading()], provenance, {}, now);
    expect(result.selection.reason).toBe("compatibility_default_retiro");
    expect(result.readings[0]?.measurements[0]).toMatchObject({
      value: 0,
      validFrom: "2026-09-30T10:00:00.000Z",
      validTo: provenance.observedAt,
    });
  });
  it("distinguishes unknown from known without readings", () => {
    expect(
      observationResult([], null, { stationId: "missing" }, now).reason,
    ).toBe("unknown_weather_station");
    expect(observationResult([], null, { stationId: "3175" }, now).reason).toBe(
      "known_station_without_observation",
    );
  });
  it("does not silently substitute Retiro outside coverage", () => {
    const result = observationResult(
      [reading()],
      provenance,
      { point: { latitude: 0, longitude: 0 } },
      now,
    );
    expect(result.reason).toBe("no_station_within_radius");
    expect(result.readings).toEqual([]);
  });
  it("selects nearest fresh before a nearer stale station", () => {
    const a = weatherStations.find((s) => s.id === "3195");
    if (!a) throw new Error("fixture station missing");
    const b = { ...a, id: "test", longitude: a.longitude + 0.01 };
    const stale = reading("3195", "2026-09-30T06:00:00Z");
    const fresh = { ...reading(), stationId: "test" };
    expect(
      selectObservedStation([a, b], [stale, fresh], a, now).selected?.station
        .id,
    ).toBe("test");
    expect(selectObservedStation([a, b], [stale], a, now).reason).toBe(
      "nearest_stale_observation",
    );
    expect(selectObservedStation([a], [], a, now).reason).toBe(
      "nearby_stations_without_observation",
    );
  });
});
