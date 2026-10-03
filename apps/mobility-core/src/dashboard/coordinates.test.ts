import { describe, expect, it } from "vitest";
import { coordinateSql, entityCoordinates } from "./coordinates";

describe("shared published coordinates", () => {
  it("supports each provider shape without inventing a position", () => {
    for (const entity of [
      { latitude: 40.4, longitude: -3.7 },
      { coordinate: { latitude: 40.4, longitude: -3.7 } },
      { stationIdentity: { location: { latitude: 40.4, longitude: -3.7 } } },
      { location: { start: { latitude: 40.4, longitude: -3.7 } } },
    ])
      expect(entityCoordinates(entity)).toEqual({
        latitude: 40.4,
        longitude: -3.7,
      });
    expect(entityCoordinates({ latitude: "40.4", longitude: null })).toEqual({
      latitude: null,
      longitude: null,
    });
  });
  it("prefers published top-level numbers consistently and skips invalid candidates", () => {
    expect(
      entityCoordinates({
        latitude: 41,
        longitude: -4,
        location: { start: { latitude: 40, longitude: -3 } },
      }),
    ).toEqual({ latitude: 41, longitude: -4 });
    expect(
      entityCoordinates({
        latitude: "bad",
        location: { start: { latitude: 40, longitude: -3 } },
      }),
    ).toEqual({ latitude: 40, longitude: -3 });
    expect(coordinateSql("latitude")).toContain(
      "entity#>'{location,start,latitude}'",
    );
  });
});
