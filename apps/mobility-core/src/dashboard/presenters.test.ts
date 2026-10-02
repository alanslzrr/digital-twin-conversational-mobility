import { expect, it } from "vitest";
import { projectDashboardEntity } from "./entities";

const now = Date.now();
const row = (entity: object, extra: object = {}) => ({
  entity,
  entity_id: "forecast:1",
  source_id: "aemet",
  product_id: "weather:forecast:28079",
  version: "fixture",
  quality: "provisional",
  ingested_at: new Date(now).toISOString(),
  checked_at: new Date(now).toISOString(),
  issued_at: new Date(now - 3600000).toISOString(),
  valid_from: new Date(now - 3600000).toISOString(),
  valid_to: new Date(now + 86400000).toISOString(),
  ...extra,
});
it("does not rejuvenate an old issue with a recent check", () => {
  expect(
    projectDashboardEntity(
      row(
        { name: "Madrid" },
        { issued_at: new Date(now - 48 * 3600000).toISOString() },
      ),
      "environment",
    ).evidence.freshness,
  ).toBe("unavailable");
  expect(
    projectDashboardEntity(
      row({ name: "Madrid", _errorCode: "upstream_error" }),
      "environment",
    ).evidence.freshness,
  ).toBe("stale");
});
it("keeps the variable, own interval, coordinate and accumulated basis", () => {
  const from = new Date(now + 3600000).toISOString(),
    to = new Date(now + 7200000).toISOString();
  const value = projectDashboardEntity(
    row({
      name: "Madrid",
      kind: "precipitation",
      value: 3,
      unit: "mm",
      basis: "interval",
      validFrom: from,
      validTo: to,
      coordinate: { latitude: 40.4, longitude: -3.7 },
    }),
    "environment",
  );
  expect(value).toMatchObject({
    kind: "forecast",
    latitude: 40.4,
    longitude: -3.7,
    evidence: { validFrom: from, validTo: to },
  });
  expect(value.measurements).toContainEqual({
    name: "precipitation",
    value: 3,
    unit: "mm",
  });
  expect(value.measurements).toContainEqual({
    name: "basis",
    value: "interval",
    unit: null,
  });
});
