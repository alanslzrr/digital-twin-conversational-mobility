import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { capFiles, parseWarnings, warningIndex } from "./aemet-cap";
import { parseHourlyForecast } from "./aemet-forecast";

const hourly = JSON.parse(
  readFileSync(
    new URL("./fixtures/weather/hourly.json", import.meta.url),
    "utf8",
  ),
);
const minor = readFileSync(
  new URL("./fixtures/weather/minor.xml", import.meta.url),
  "utf8",
);
describe("official weather product semantics", () => {
  it("keeps previous-hour precipitation, trace and six-hour probability across midnight", () => {
    const p = parseHourlyForecast(hourly, "28079");
    expect(p.issuedAt).toBe("2026-09-28T17:33:07.000Z");
    expect(
      p.periods.find((p) => p.kind === "precipitation" && p.value === "Ip"),
    ).toMatchObject({
      validFrom: "2026-09-28T18:00:00.000Z",
      validTo: "2026-09-28T19:00:00.000Z",
    });
    expect(
      p.periods.find(
        (p) => p.kind === "precipitation_probability" && p.period === "2002",
      ),
    ).toMatchObject({
      validFrom: "2026-09-28T18:00:00.000Z",
      validTo: "2026-09-29T00:00:00.000Z",
      value: 10,
    });
  });
  it("rejects municipality mismatch and omits ambiguous DST intervals rather than guessing", () => {
    expect(() => parseHourlyForecast(hourly, "28005")).toThrow();
    const f = structuredClone(hourly);
    f[0].prediccion.dia[0].fecha = "2026-10-25T00:00:00";
    f[0].prediccion.dia[0].precipitacion = [
      { periodo: "02", value: "1" },
      { periodo: "05", value: "0" },
    ];
    const p = parseHourlyForecast(f, "28079");
    expect(p.omittedAmbiguousPeriods).toBeGreaterThan(0);
    expect(
      p.periods.some((v) => v.kind === "precipitation" && v.value === 1),
    ).toBe(false);
  });
  it("deduplicates languages, retains official polygons and Minor without inventing all-clear", () => {
    const p = parseWarnings([minor], "2026-09-27T21:50:01.000Z");
    expect(p.records).toHaveLength(1);
    expect(p.records[0]?.severity).toBe("Minor");
    expect(p.records[0]?.areas.map((a) => a.code)).toEqual([
      "722801",
      "722802",
      "722803",
    ]);
    expect(p.records[0]?.validFrom).toBe("2026-09-29T22:00:00.000Z");
  });
  it("fails closed for invalid full publications, test-only and injected XML", () => {
    for (const bad of [
      minor.slice(0, -20),
      minor.replace("<status>Actual</status>", "<status>Test</status>"),
      '<!DOCTYPE alert [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + minor,
    ])
      expect(() => parseWarnings([bad], new Date().toISOString())).toThrow();
    expect(() => capFiles(gzipSync(Buffer.alloc(512)))).toThrow();
    expect(() => capFiles(gzipSync(Buffer.alloc(4_000_001)))).toThrow();
  });
  it("applies Update references even when an earlier message is still in the complete bundle", () => {
    const oldId = /<identifier>(.*?)<\/identifier>/.exec(minor)?.[1];
    const revised = minor
      .replace(oldId ?? "", "new-id")
      .replace(
        "<msgType>Alert</msgType>",
        `<msgType>Update</msgType><references>http://www.aemet.es,${oldId},2026-09-27T21:50:01Z</references>`,
      )
      .replaceAll("Minor", "Moderate");
    const p = parseWarnings([minor, revised], new Date().toISOString());
    expect(p.records).toHaveLength(1);
    expect(p.records[0]?.severity).toBe("Moderate");
  });
  it("only permits the official Madrid complete-state archive", () => {
    expect(() =>
      warningIndex(
        '<feed><entry><updated>2026-09-28T00:00:00Z</updated><link href="https://evil.example/a_AFAP7228.tar.gz"/></entry></feed>',
      ),
    ).toThrow();
  });
  it("honors operational Cancel references without inventing a green replacement", () => {
    const oldId = /<identifier>(.*?)<\/identifier>/.exec(minor)?.[1];
    const cancel = minor
      .replace(oldId ?? "", "cancel-id")
      .replace(
        "<msgType>Alert</msgType>",
        `<msgType>Cancel</msgType><references>http://www.aemet.es,${oldId},2026-09-27T21:50:01Z</references>`,
      )
      .replace(/<info>[\s\S]*?<\/info>/g, "");
    expect(
      parseWarnings([minor, cancel], "2026-09-28T00:00:00Z").records,
    ).toEqual([]);
  });
});
