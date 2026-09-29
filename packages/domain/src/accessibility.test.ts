import type { AccessibilityRef } from "@mobility/contracts";
import { expect, it } from "vitest";
import {
  type AccessibilityRecord,
  interpretAccessibility,
} from "./accessibility";

const ref: AccessibilityRef = {
  feed: "renfe",
  version: "v1",
  entity: "stop",
  externalId: "child",
};
const row: AccessibilityRecord = {
  ...ref,
  code: 0,
  locationType: 0,
  parentId: "parent",
  provenance: null,
};
const parent: AccessibilityRecord = {
  ...ref,
  externalId: "parent",
  code: 1,
  locationType: 1,
  provenance: null,
};
it.each([
  [0, "unknown"],
  [1, "declared_accessible"],
  [2, "declared_not_accessible"],
  [null, "unknown"],
] as const)("interprets %s without inventing declarations", (code, status) => {
  expect(
    interpretAccessibility(ref, { ...row, code, parentId: null }).status,
  ).toBe(status);
});
it("inherits only from a published station and preserves normalized child zero", () => {
  const r = interpretAccessibility(ref, row, parent);
  expect(r.status).toBe("declared_accessible");
  expect(r.normalizedCode).toBe(0);
  expect(r.inheritedFrom?.externalId).toBe("parent");
  expect(interpretAccessibility(ref, { ...row, code: 2 }, parent).status).toBe(
    "declared_not_accessible",
  );
  expect(
    interpretAccessibility(ref, { ...row, locationType: 2 }, parent).status,
  ).toBe("declared_accessible");
});
it("rejects cycles, wrong parents, unsupported locations and cross-feed/version evidence", () => {
  for (const p of [
    { ...parent, parentId: "child" },
    { ...parent, locationType: 0 },
    { ...parent, version: "v2" },
    { ...parent, feed: "emt" },
    { ...parent, externalId: "other" },
  ])
    expect(interpretAccessibility(ref, row, p).status).toBe("unknown");
  expect(
    interpretAccessibility(ref, { ...row, parentId: "child" }, row).status,
  ).toBe("unknown");
  expect(
    interpretAccessibility(ref, { ...row, locationType: 4, code: 1 }).status,
  ).toBe("unknown");
  expect(
    interpretAccessibility(ref, { ...row, code: 1, version: "v2" }).status,
  ).toBe("unknown");
  expect(
    interpretAccessibility(ref, { ...row, code: 1, feed: "emt" }).status,
  ).toBe("unknown");
});
it("never inherits a vehicle declaration from a stop", () => {
  const trip = { ...ref, entity: "trip" as const };
  expect(interpretAccessibility(trip, { ...row, ...trip }, parent).status).toBe(
    "unknown",
  );
  expect(
    interpretAccessibility(ref, { ...row, code: 1 }).operationalStatus,
  ).toBe("not_verified");
});
it("keeps ML2/ML3 negative codes with a version-scoped unresolved discrepancy", () => {
  const m = {
    ...ref,
    feed: "light-rail",
    version: "7e49cfc0980c8e61d96a258d1076ec410a26f66767586d1b1dea49b9caa39467",
  };
  const r = { ...row, ...m, code: 2, lines: ["ML2", "ML3"] };
  const d = interpretAccessibility(m, r);
  expect(d.status).toBe("declared_not_accessible");
  expect(d.qualityNotes[0]?.lines).toEqual(["ML2", "ML3"]);
  expect(
    interpretAccessibility({ ...m, version: "new" }, { ...r, version: "new" })
      .qualityNotes,
  ).toEqual([]);
  expect(
    interpretAccessibility(m, { ...r, lines: ["ML1"] }).qualityNotes,
  ).toEqual([]);
});
