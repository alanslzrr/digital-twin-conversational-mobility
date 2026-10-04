import { expect, it } from "vitest";
import { bucketStep } from "./activity-chart";

it("bounds exact UTC windows, including Madrid daylight transitions", () => {
  const start = "2026-10-25T00:00:00Z";
  for (const [hours, expected] of [
    [1, 300000],
    [24, 3600000],
    [168, 21600000],
  ] as const) {
    const end = new Date(Date.parse(start) + hours * 3600000).toISOString();
    expect(bucketStep(start, end)).toBe(expected);
    expect((hours * 3600000) / expected).toBeLessThanOrEqual(28);
  }
  expect(() => bucketStep(start, start)).toThrow();
});
