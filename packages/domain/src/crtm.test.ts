import { describe, expect, it } from "vitest";
import { gtfsClock, gtfsInstant, gtfsServiceEpoch, madridDate } from "./crtm";

describe("Madrid GTFS service clock", () => {
  it("retains next-day times and a Madrid civil date", () => {
    expect(gtfsInstant("2026-09-25", 90000)).toBe("2026-09-25T23:00:00.000Z");
    expect(gtfsClock(90000)).toBe("25:00:00");
    expect(madridDate(new Date("2026-09-24T23:30:00Z"))).toBe("2026-09-25");
  });
  it("uses noon minus twelve elapsed hours across both DST transitions", () => {
    expect(gtfsInstant("2026-03-29", 0)).toBe("2026-03-28T22:00:00.000Z");
    expect(gtfsInstant("2026-10-25", 0)).toBe("2026-10-24T23:00:00.000Z");
  });
  it("rejects non-existent service dates", () => {
    expect(() => gtfsServiceEpoch("2026-02-30")).toThrow(
      "invalid_service_date",
    );
  });
});
