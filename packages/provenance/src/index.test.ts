import { describe, expect, it } from "vitest";
import { entityObservation, getFreshness, temporalCoverage } from "./index";

const now = new Date("2026-09-23T12:00:00Z");
const base = {
  source: "renfe" as const,
  ingestedAt: now.toISOString(),
  quality: "provisional" as const,
};

describe("source freshness", () => {
  it("never treats missing data as fresh", () => {
    expect(getFreshness(null, 40, now).status).toBe("unavailable");
  });
  it("uses observation time, not recent ingestion time", () => {
    expect(
      getFreshness({ ...base, observedAt: "2026-09-23T11:59:03Z" }, 40, now),
    ).toEqual({ status: "stale", ageSeconds: 57 });
  });
  it("is fresh at the threshold but stale a millisecond later", () => {
    expect(
      getFreshness({ ...base, observedAt: "2026-09-23T11:59:20Z" }, 40, now)
        .status,
    ).toBe("fresh");
    expect(
      getFreshness({ ...base, observedAt: "2026-09-23T11:59:19.999Z" }, 40, now)
        .status,
    ).toBe("stale");
  });
  it("rejects invalid and far-future observation timestamps", () => {
    expect(getFreshness({ ...base, observedAt: "bad" }, 40, now).status).toBe(
      "unavailable",
    );
    expect(
      getFreshness({ ...base, observedAt: "2026-09-24T12:00:00Z" }, 40, now)
        .reason,
    ).toBe("future_observation");
  });
  it("tolerates at most 30 seconds of forward clock skew", () => {
    expect(
      getFreshness({ ...base, observedAt: "2026-09-23T12:00:20Z" }, 40, now)
        .ageSeconds,
    ).toBe(0);
  });
  it("rejects an invalid freshness policy", () => {
    expect(() => getFreshness(null, -1, now)).toThrow(RangeError);
  });
});

describe("entity provenance", () => {
  const collection = { ...base, observedAt: now.toISOString() };
  it("never lends a fresh collection timestamp to absent or old entities", () => {
    expect(entityObservation(collection, null, 60, now)).toMatchObject({
      provenance: null,
      freshness: { status: "unavailable" },
    });
    expect(
      entityObservation(collection, "2026-09-23T10:00:00Z", 60, now),
    ).toMatchObject({
      provenance: {
        observedAt: "2026-09-23T10:00:00Z",
        ingestedAt: now.toISOString(),
      },
      freshness: { status: "stale" },
    });
  });
  it("summarizes mixed freshness instead of reporting all entities fresh", () => {
    expect(
      temporalCoverage(
        collection,
        [now.toISOString(), "2026-09-23T10:00:00Z", null],
        60,
        now,
      ),
    ).toEqual({
      total: 3,
      fresh: 1,
      stale: 1,
      unavailable: 1,
      status: "partial_or_unavailable",
    });
    expect(temporalCoverage(collection, [], 60, now).status).toBe(
      "unavailable",
    );
  });
});
