import { describe, expect, it } from "vitest";
import {
  deriveDestinationEvidence,
  normalizeLine,
  resolveLine,
  tripDestination,
} from "./transit-identity";

const stops = new Map([
  ["a", "Álamo"],
  ["b", "Sol"],
  ["c", "Terminal Norte"],
]);
const times = (ids: string[]) =>
  ids.map((stop_id, i) => ({ stop_id, stop_sequence: String(i * 10 + 1) }));
describe("operator line identity", () => {
  it.each(["C5", "c-5", " C - 5 ", "c 5"])(
    "resolves %s through the Renfe catalog",
    (name) => {
      expect(
        resolveLine("renfe", name, [{ id: "r", name: "C-5" }]),
      ).toMatchObject({ status: "known", routeIds: ["r"] });
    },
  );
  it("preserves branches, leading zeros and operator identities", () => {
    expect(
      new Set(["C4", "C4a", "C4b"].map((s) => normalizeLine("renfe", s))).size,
    ).toBe(3);
    expect(normalizeLine("emt", "002")).not.toBe(normalizeLine("emt", "2"));
    expect(normalizeLine("emt", "EMT002")).not.toBe(normalizeLine("emt", "2"));
    expect(normalizeLine("emt", "C-5")).toBe("C-5");
  });
  it("distinguishes unknown line from missing catalog", () => {
    expect(resolveLine("renfe", "C9", [{ id: "r", name: "C5" }]).status).toBe(
      "unknown",
    );
    expect(resolveLine("emt", "2", []).status).toBe("catalog_unavailable");
  });
});
describe("trip destination evidence", () => {
  it("does not mistake Renfe CIVIS service labels for destinations", () => {
    expect(tripDestination("CIVIS", null, "a")).toEqual({
      name: null,
      basis: "unknown",
    });
    expect(
      tripDestination(
        " civis ",
        deriveDestinationEvidence(times(["a", "b"]), stops),
        "a",
      ),
    ).toEqual({ name: "Sol", basis: "derived_terminal" });
  });
  it("uses numerical sequence rather than row order or route endpoints", () => {
    const evidence = deriveDestinationEvidence(
      times(["a", "b", "c"]).reverse(),
      stops,
    );
    expect(tripDestination("", evidence, "a")).toEqual({
      name: "Terminal Norte",
      basis: "derived_terminal",
    });
  });
  it("handles reverse direction and short services independently", () => {
    expect(
      tripDestination(
        "",
        deriveDestinationEvidence(times(["c", "b", "a"]), stops),
        "c",
      ).name,
    ).toBe("Álamo");
    expect(
      tripDestination(
        "",
        deriveDestinationEvidence(times(["a", "b"]), stops),
        "a",
      ).name,
    ).toBe("Sol");
  });
  it("prefers explicit stop and trip headsigns over computed terminal", () => {
    const evidence = deriveDestinationEvidence(
      [
        { stop_id: "a", stop_sequence: "1", stop_headsign: "  Centro  " },
        ...times(["a", "b", "c"]).slice(1),
      ],
      stops,
    );
    expect(tripDestination("Norte", evidence, "a")).toEqual({
      name: "Centro",
      basis: "stop_headsign",
    });
    expect(tripDestination(" Norte ", evidence, "b")).toEqual({
      name: "Norte",
      basis: "trip_headsign",
    });
  });
  it("does not infer a circular service's destination or resolve repeated stop headsigns", () => {
    const circular = times(["a", "b", "a"]).map((t) => ({
      ...t,
      stop_headsign: "ambiguous",
    }));
    expect(
      tripDestination("", deriveDestinationEvidence(circular, stops), "a"),
    ).toEqual({ name: null, basis: "unknown" });
  });
  it("does not label the current terminal as an onward destination", () => {
    expect(
      tripDestination(
        "",
        deriveDestinationEvidence(times(["a", "b"]), stops),
        "b",
      ).basis,
    ).toBe("unknown");
  });
  it.each([
    undefined,
    [],
    times(["a"]),
    times(["a", "missing"]),
    [
      { stop_id: "a", stop_sequence: "1" },
      { stop_id: "b", stop_sequence: "1" },
    ],
    [
      { stop_id: "a", stop_sequence: "" },
      { stop_id: "b", stop_sequence: "2" },
    ],
  ])("rejects insufficient or invalid sequence %#", (input) => {
    expect(deriveDestinationEvidence(input, stops).terminal).toBeNull();
  });
});
