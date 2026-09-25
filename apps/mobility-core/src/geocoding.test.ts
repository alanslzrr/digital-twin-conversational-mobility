import { afterEach, expect, it, vi } from "vitest";
import { geocoderConfig, parseGeocodes } from "./adapters/geocoder";

const sample = {
  osm_type: "way",
  osm_id: 72,
  display_name: "Museo, Madrid",
  lat: "40.4",
  lon: "-3.7",
  address: { country_code: "es" },
  addresstype: "building",
};
afterEach(() => vi.unstubAllEnvs());
it("validates coordinates and stable OSM references, retains precision and deduplicates", () => {
  expect(parseGeocodes([sample, sample])).toEqual([
    {
      externalId: "way:72",
      name: "Museo, Madrid",
      latitude: 40.4,
      longitude: -3.7,
      precision: "building",
      sourceUrl: "https://www.openstreetmap.org/way/72",
    },
  ]);
  expect(parseGeocodes([{ ...sample, lat: "50" }])).toEqual([]);
  expect(
    parseGeocodes([{ ...sample, address: { country_code: "fr" } }]),
  ).toEqual([]);
  expect(() => parseGeocodes([{ ...sample, osm_id: -1 }])).toThrow();
});
it("requires explicit configuration, identification and public-policy acceptance", () => {
  vi.stubEnv("GEOCODER_ENABLED", "true");
  vi.stubEnv("GEOCODER_URL", "https://nominatim.openstreetmap.org/search");
  vi.stubEnv("GEOCODER_USER_AGENT", "Mobility-local-test/1");
  vi.stubEnv("GEOCODER_PUBLIC_POLICY_ACCEPTED", "false");
  expect(geocoderConfig()).toBeNull();
  vi.stubEnv("GEOCODER_PUBLIC_POLICY_ACCEPTED", "true");
  expect(geocoderConfig()).not.toBeNull();
  vi.stubEnv("GEOCODER_URL", "http://remote.invalid/search");
  expect(() => geocoderConfig()).toThrow();
  vi.stubEnv("GEOCODER_URL", "https://user:password@example.invalid/search");
  expect(() => geocoderConfig()).toThrow();
});
