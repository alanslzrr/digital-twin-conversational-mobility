import { expect, it } from "vitest";
import {
  emtOperationTime,
  parseEmtArrivals,
  parseEmtCatalog,
} from "./emt-transit";

const now = Date.parse("2026-09-25T14:00:10Z");
const row = {
  line: "001",
  stop: "72",
  destination: "MONCLOA",
  estimateArrive: 60,
  DistanceBus: 100,
};
const body = (arrivals: unknown[] = [row]) => ({
  code: "00",
  datetime: "2026-09-25T16:00:00.123456",
  data: [{ Arrive: arrivals }],
});
it("preserves public zeros, provider destination and absolute operation-based estimate", () => {
  expect(parseEmtArrivals(body(), "72", now)).toMatchObject({
    observedAt: "2026-09-25T14:00:00.000Z",
    arrivals: [
      {
        line: "001",
        destination: "MONCLOA",
        destinationEvidence: "provider",
        estimatedArrivalAt: "2026-09-25T14:01:00.000Z",
      },
    ],
  });
});
it("keeps unknown destinations and horizon sentinels honest", () => {
  expect(
    parseEmtArrivals(
      body([{ ...row, destination: "", estimateArrive: 999999 }]),
      "72",
      now,
    ).arrivals[0],
  ).toMatchObject({
    destination: null,
    estimatedArrivalAt: null,
    estimateSecondsAtObservation: null,
    estimateStatus: "beyond_prediction_horizon",
  });
});
it("accepts an explicit empty successful predictions list", () => {
  expect(parseEmtArrivals(body([]), "72", now).arrivals).toEqual([]);
});
it("rejects mismatched stops, failed responses, invalid estimates and missing data", () => {
  expect(() => parseEmtArrivals(body(), "73", now)).toThrow();
  expect(() =>
    parseEmtArrivals({ ...body(), code: "80" }, "72", now),
  ).toThrow();
  expect(() =>
    parseEmtArrivals(body([{ ...row, estimateArrive: -1 }]), "72", now),
  ).toThrow();
  expect(() => parseEmtArrivals({ ...body(), data: [] }, "72", now)).toThrow();
});
it("rejects ambiguous DST, missing zone context and future observations", () => {
  expect(() =>
    emtOperationTime("2026-10-25T02:30:00", Date.parse("2026-10-26T00:00:00Z")),
  ).toThrow();
  expect(() => emtOperationTime("not-a-time", now)).toThrow();
  expect(() => emtOperationTime("2026-09-25T16:05:00", now)).toThrow();
  expect(emtOperationTime("2026-09-25T16:00:00+02:00", now)).toBe(
    "2026-09-25T14:00:00.000Z",
  );
});
const lines = {
  code: "00",
  data: [{ line: "361", label: "001", nameA: "ATOCHA", nameB: "MONCLOA" }],
};
const stops = {
  code: "00",
  data: [
    {
      node: "72",
      name: "Stop",
      geometry: { type: "Point", coordinates: [-3.7, 40.4] },
      lines: ["361/1", "361/2"],
    },
  ],
};
it("keeps internal line, public label, stop and both direction identities separate", () => {
  const result = parseEmtCatalog(stops, lines);
  expect(result.lines[0]).toMatchObject({ line: "361", label: "001" });
  expect(result.stops[0]?.lines).toEqual(["361/1", "361/2"]);
});
it("rejects duplicate identities, empty catalogs and broken line references", () => {
  expect(() =>
    parseEmtCatalog(stops, { ...lines, data: [...lines.data, ...lines.data] }),
  ).toThrow();
  expect(() => parseEmtCatalog({ ...stops, data: [] }, lines)).toThrow();
  expect(() =>
    parseEmtCatalog(stops, {
      ...lines,
      data: [{ ...lines.data[0], line: "001" }],
    }),
  ).toThrow();
});
