import { describe, expect, it } from "vitest";
import {
  compareSnapshotReadings,
  partitionCounts,
  prepareHistory,
  type SnapshotReading,
  summarizeUsage,
  validateDuration,
} from "./core";

const before: SnapshotReading = {
  metricId: "M1",
  selectionKey: "sum-v1:bikes",
  unit: "bikes",
  value: 0,
  readAt: "2026-10-03T11:30:00Z",
  included: 2,
  observed: 4,
};
const current = { ...before, value: 12, readAt: "2026-10-03T11:30:15Z" };
describe("factual session readings, never performance", () => {
  it("keeps zero baseline and neutral absolute changes", () => {
    expect(compareSnapshotReadings(current, before)).toMatchObject({
      status: "reading-change",
      delta: 12,
      tone: "neutral",
    });
  });
  it("first load is unavailable", () =>
    expect(compareSnapshotReadings(current, null).status).toBe("unavailable"));
  it.each([
    { value: null },
    { unit: "ms" },
    { selectionKey: "another-owner:parking" },
    { readAt: before.readAt },
    { readAt: "2026-10-03T11:40:00Z" },
  ])("rejects missing, changed, old or stale scope %j", (change) =>
    expect(
      compareSnapshotReadings({ ...current, ...change }, before).status,
    ).toBe("unavailable"),
  );
  it("coverage changes are not increases", () =>
    expect(
      compareSnapshotReadings({ ...current, included: 3 }, before).status,
    ).toBe("coverage-changed"));
  it("unchanged is a legitimate zero delta", () =>
    expect(
      compareSnapshotReadings({ ...current, value: 0 }, before),
    ).toMatchObject({ delta: 0 }));
});
describe("graphic guards", () => {
  it("rejects unknown and overlapping partitions", () => {
    expect(
      partitionCounts({ total: 4, recent: 2, stale: null, unavailable: 1 })
        .status,
    ).toBe("unavailable");
    expect(
      partitionCounts({ total: 4, recent: 4, stale: 1, unavailable: 0 }).status,
    ).toBe("inconsistent");
  });
  it("preserves exact empty", () =>
    expect(
      partitionCounts({ total: 0, recent: 0, stale: 0, unavailable: 0 }).status,
    ).toBe("empty"));
  it("checks 100 deterministic exhaustive partitions", () => {
    for (let i = 1; i <= 100; i++) {
      const p = partitionCounts({
        total: i * 6,
        recent: i,
        stale: i * 2,
        unavailable: i * 3,
      });
      expect(p.status).toBe("available");
      if (p.status === "available")
        expect(p.parts.reduce((sum, p) => sum + p.fraction, 0)).toBeCloseTo(1);
    }
  });
  const point = {
    observedAt: "2026-10-03T11:30:00Z",
    ingestedAt: "2026-10-03T11:30:01Z",
    revisionId: "r1",
    value: 0,
  };
  it("one point remains one observation", () =>
    expect(prepareHistory([point], 60)).toMatchObject({
      status: "available",
      gaps: 0,
      points: [{ value: 0 }],
    }));
  it("gap separator is not an exact observation or zero", () => {
    const p = prepareHistory(
      [
        point,
        {
          ...point,
          observedAt: "2026-10-03T11:40:00Z",
          revisionId: "r2",
          value: 3,
        },
      ],
      60,
    );
    expect(p).toMatchObject({ gaps: 1 });
    expect(p.points[1]).toMatchObject({ gap: true, value: null });
  });
  it("ambiguous revision timestamps fall back to exact records", () =>
    expect(
      prepareHistory([point, { ...point, revisionId: "r2" }], 60).status,
    ).toBe("table-only"));
  it("p95 is absent below 20; median accepts one", () => {
    expect(
      validateDuration({
        component: "ingestion",
        operation: "publication",
        n: 1,
        medianMs: 2,
        p95Ms: null,
      }),
    ).toBe(true);
    expect(
      validateDuration({
        component: "ingestion",
        operation: "publication",
        n: 19,
        medianMs: 2,
        p95Ms: 3,
      }),
    ).toBe(false);
  });
  it("usage parents are counted once, missing remains unknown", () => {
    expect(
      summarizeUsage({
        input: 10,
        output: 5,
        cachedInput: 8,
        reasoningOutput: 3,
      }),
    ).toMatchObject({ total: 15 });
    expect(
      summarizeUsage({
        input: 10,
        output: null,
        cachedInput: 8,
        reasoningOutput: null,
      }),
    ).toMatchObject({ total: null });
    expect(
      summarizeUsage({
        input: 10,
        output: 5,
        cachedInput: 11,
        reasoningOutput: 3,
      }).status,
    ).toBe("invalid");
  });
});
