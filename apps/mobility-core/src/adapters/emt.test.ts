import { describe, expect, it } from "vitest";
import { parseEmtIncidents } from "./emt";

const now = Date.parse("2026-09-25T10:00:00Z");
const alert = {
  guid: "test",
  title: "Notice",
  description: "Works <img src='unsafe'>",
  category: ["27"],
  pubDate: "Fri, 25 Sep 2026 08:00:00 GMT",
  rssAfectaDesde: "25/09/2026 9:00:00",
  rssAfectaHasta: "25/09/2026 18:00:00",
};
const feed = (row = alert) => ({
  code: "00",
  data: [{ lastBuildDate: "Fri, 25 Sep 2026 09:59:00 GMT", item: [row] }],
});
describe("EMT incidents", () => {
  it("retains feed age and converts Madrid periods without HTML", () => {
    const result = parseEmtIncidents(feed(), now);
    expect(result.observedAt).toBe("2026-09-25T09:59:00.000Z");
    expect(result.alerts[0]).toMatchObject({
      startsAt: "2026-09-25T07:00:00.000Z",
      temporalStatus: "active",
      description: "Works",
    });
  });
  it("does not assert active for unknown periods", () =>
    expect(
      parseEmtIncidents(feed({ ...alert, rssAfectaHasta: "fin de obras" }), now)
        .alerts[0]?.temporalStatus,
    ).toBe("unknown"));
  it("separates upcoming and expired notices", () => {
    expect(
      parseEmtIncidents(
        feed({
          ...alert,
          rssAfectaDesde: "26/09/2026 9:00:00",
          rssAfectaHasta: "27/09/2026 18:00:00",
        }),
        now,
      ).alerts[0]?.temporalStatus,
    ).toBe("upcoming");
    expect(
      parseEmtIncidents(
        feed({
          ...alert,
          rssAfectaDesde: "24/09/2026 9:00:00",
          rssAfectaHasta: "24/09/2026 18:00:00",
        }),
        now,
      ).alerts[0]?.temporalStatus,
    ).toBe("expired");
  });
  it("rejects business errors and future observation times", () => {
    expect(() => parseEmtIncidents({ code: "84", data: [] }, now)).toThrow();
    expect(() => parseEmtIncidents(feed(), now - 3600000)).toThrow();
  });
  it("preserves empty feeds", () =>
    expect(
      parseEmtIncidents(
        {
          code: "00",
          data: [{ lastBuildDate: "Fri, 25 Sep 2026 09:59:00 GMT", item: [] }],
        },
        now,
      ).alerts,
    ).toEqual([]));
});

it("preserves identifiers including leading zeroes in singleton categories", () => {
  const input = feed();
  const first = input.data[0];
  if (!first) throw new Error("fixture missing");
  first.item[0] = {
    ...alert,
    category: "002",
  } as unknown as typeof alert;
  expect(parseEmtIncidents(input, now).alerts[0]?.lines).toEqual(["002"]);
});
