import { expect, it } from "vitest";
import { airStationIdentity } from "./air-stations";

it("matches official municipal identity and coordinates, not analyzer liveness", () => {
  expect(airStationIdentity("004", "28079004_8_8")).toMatchObject({
    canonicalId: "28079004",
    name: "Plaza de España",
    status: "matched_static_catalog",
    location: { latitude: 40.4238823, longitude: -3.7122567 },
    catalogProvenance: { kind: "static_catalog" },
  });
});
it("keeps identity partial for unknown or conflicting codes", () => {
  expect(airStationIdentity("999", "28079999_8_8")).toMatchObject({
    status: "partial",
    name: null,
    location: null,
  });
  expect(airStationIdentity("4", "28079008_8_8").status).toBe("partial");
});
