import { expect, it } from "vitest";
import { accessibilityServiceEnvelope } from "./accessibility";

it("marks expired service coverage without inventing inspection or new publication dates", () => {
  const now = new Date("2026-09-29T08:00:00Z");
  expect(accessibilityServiceEnvelope("2026-01-01", "2026-05-27", now)).toBe(
    false,
  );
  expect(accessibilityServiceEnvelope("2026-09-01", "2026-10-01", now)).toBe(
    true,
  );
  expect(accessibilityServiceEnvelope(null, null, now)).toBeNull();
});
