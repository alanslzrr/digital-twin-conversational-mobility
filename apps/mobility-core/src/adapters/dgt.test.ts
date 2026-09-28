import { readFileSync } from "node:fs";
import { dgtTemporalStatus } from "@mobility/domain";
import { describe, expect, it } from "vitest";
import { parseDgt } from "./dgt";

const xml = readFileSync(
  new URL("./fixtures/dgt-public-excerpt.xml", import.meta.url),
  "utf8",
);
const now = Date.parse("2026-09-28T15:12:00Z");
describe("official DGT 3.7 publication", () => {
  it("normalizes real identities, versions, road, direction and endpoints", () => {
    const result = parseDgt(xml, now);
    expect(result.incidents).toHaveLength(2);
    expect(
      result.incidents.find((i) => i.id === "2816645:18811074"),
    ).toMatchObject({
      id: "2816645:18811074",
      version: 2,
      road: "N-400",
      direction: "both",
      location: {
        type: "segment_endpoints",
        start: { province: "Toledo", kilometerPoint: 37.1 },
      },
    });
    expect(
      result.incidents.some(
        (i) =>
          i.location.type === "point" &&
          i.location.start?.province === "Huesca",
      ),
    ).toBe(true);
    expect(result.observedAt).toBe("2026-09-28T15:11:05.393Z");
  });
  it("rejects malformed, DTD and oversized payloads", () => {
    for (const value of [
      "<broken>",
      `<!DOCTYPE payload>${xml}`,
      " ".repeat(8_000_001),
    ])
      expect(() => parseDgt(value, now)).toThrow();
  });
  it("rejects another profile and invalid coordinates", () => {
    expect(() => parseDgt(xml.replace("3.7_1.0", "4.0"), now)).toThrow();
    expect(() => parseDgt(xml.replace("39.994446", "999"), now)).toThrow();
  });
  it("supports a legitimate empty full publication", () => {
    expect(
      parseDgt(
        xml.replace(/<sit:situation\b[\s\S]*?<\/sit:situation>/g, ""),
        now,
      ).incidents,
    ).toEqual([]);
  });
  it("deduplicates identical records but rejects conflicting duplicates", () => {
    const situation =
      xml.match(/<sit:situation\b[\s\S]*?<\/sit:situation>/)?.[0] ?? "";
    expect(
      parseDgt(xml.replace("</d2:payload>", `${situation}</d2:payload>`), now)
        .incidents,
    ).toHaveLength(2);
    expect(() =>
      parseDgt(
        xml.replace(
          "</d2:payload>",
          `${situation.replace('version="2"', 'version="3"')}</d2:payload>`,
        ),
        now,
      ),
    ).toThrow("conflicting_dgt_record");
  });
  it("does not equate record age or time conflict with provider cancellation", () => {
    const incident = parseDgt(xml, now).incidents[0];
    if (!incident) throw new Error("fixture");
    expect(dgtTemporalStatus(incident, now)).toBe("published_active");
    expect(
      dgtTemporalStatus({ ...incident, endsAt: "2026-09-20T10:00:00Z" }, now),
    ).toBe("published_active_time_conflict");
    expect(
      dgtTemporalStatus({ ...incident, providerValidity: "planned" }, now),
    ).toBe("planned");
    expect(
      dgtTemporalStatus({ ...incident, informationStatus: "test" }, now),
    ).toBe("unknown");
    expect(dgtTemporalStatus({ ...incident, complexValidity: true }, now)).toBe(
      "unknown",
    );
  });
});
