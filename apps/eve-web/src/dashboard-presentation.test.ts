import { describe, expect, it } from "vitest";
import {
  madridCandidates,
  madridLocal,
  readState,
  successfulReadAt,
} from "./dashboard-presentation";

describe("presentation reads remain distinct from evidence", () => {
  it("separates initial load, failure, cached failure and successful empty", () => {
    expect(readState(undefined, true, null)).toBe("loading");
    expect(readState(undefined, false, new Error())).toBe("failed");
    expect(readState({ sources: [] }, false, null)).toBe("ready");
    expect(
      readState({ readAt: "2026-10-03T08:00:00Z" }, false, new Error()),
    ).toBe("cached_failure");
  });
  it("uses only successful response readAt, never attempts or status timestamps", () => {
    const data = { readAt: "2026-10-03T08:00:00Z" };
    expect(successfulReadAt(data)).toBe(data.readAt);
    expect(
      successfulReadAt({ at: Date.now(), activeUntil: data.readAt }),
    ).toBeNull();
    expect(successfulReadAt({ readAt: "invalid" })).toBeNull();
    expect(successfulReadAt(null)).toBeNull();
  });
});
describe("Europe/Madrid civil time", () => {
  it("rejects nonexistent spring DST times and invalid dates", () => {
    for (const t of [
      "2026-03-29T02:30",
      "2026-02-30T12:00",
      "2026-10-03T25:00",
      "invalid",
    ])
      expect(madridCandidates(t)).toEqual([]);
  });
  it("returns explicit choices for an ambiguous autumn DST time", () => {
    expect(madridCandidates("2026-10-25T02:30")).toEqual([
      { instant: "2026-10-25T01:30:00.000Z", offset: "+01:00" },
      { instant: "2026-10-25T00:30:00.000Z", offset: "+02:00" },
    ]);
  });
  it("transports UTC instants and displays Madrid in winter and summer", () => {
    expect(madridCandidates("2026-01-03T10:30")[0]?.instant).toBe(
      "2026-01-03T09:30:00.000Z",
    );
    expect(madridCandidates("2026-10-03T10:30")[0]?.instant).toBe(
      "2026-10-03T08:30:00.000Z",
    );
    expect(madridLocal("2026-10-03T08:30:00Z")).toBe("2026-10-03T10:30");
  });
});
