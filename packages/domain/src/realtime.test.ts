import { describe, expect, it } from "vitest";
import { alertPeriodStatus, sameServiceTrip } from "./realtime";

const serviceDay = Date.parse("2026-09-23T00:00:00+02:00") / 1000;
describe("realtime trip identity", () => {
  it("distinguishes the same trip on successive service days", () => {
    expect(
      sameServiceTrip(
        {
          tripId: "t",
          startDate: "20260922",
          observedAt: "2026-09-23T10:00:00Z",
        },
        "t",
        serviceDay,
      ),
    ).toBe(false);
    expect(
      sameServiceTrip(
        {
          tripId: "t",
          startDate: "20260923",
          observedAt: "2026-09-23T10:00:00Z",
        },
        "other",
        serviceDay,
      ),
    ).toBe(false);
  });
  it("accepts an explicit prior service date after midnight", () => {
    expect(
      sameServiceTrip(
        {
          tripId: "t",
          startDate: "20260923",
          observedAt: "2026-09-24T01:00:00Z",
        },
        "t",
        serviceDay,
      ),
    ).toBe(true);
  });
  it("uses Madrid time when the optional date is absent and fails conservatively overnight", () => {
    expect(
      sameServiceTrip(
        { tripId: "t", observedAt: "2026-09-22T22:10:00Z" },
        "t",
        serviceDay,
      ),
    ).toBe(true);
    expect(
      sameServiceTrip(
        { tripId: "t", observedAt: "2026-09-23T22:10:00Z" },
        "t",
        serviceDay,
      ),
    ).toBe(false);
  });
});

describe("published notice periods", () => {
  it.each([
    [[], "unknown"],
    [[{ start: 110 }], "upcoming"],
    [[{ end: 90 }], "expired"],
    [[{ start: 90, end: 110 }], "active"],
    [[{ start: 110, end: 90 }], "unknown"],
    [[{ end: 90 }, { start: 110 }], "upcoming"],
    [[{}, { start: 110 }], "unknown"],
  ] as const)("classifies %j as %s", (periods, expected) => {
    expect(alertPeriodStatus(periods, 100)).toBe(expected);
  });
});
