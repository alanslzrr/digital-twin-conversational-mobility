import { describe, expect, it } from "vitest";
import { admitTools, emptyToolBudget, finishTool } from "./tool-budget";

const action = (
  callId: string,
  toolName = "connection_search",
  input: unknown = { query: "route" },
) => ({ callId, kind: "tool-call", toolName, input });
describe("bounded tool execution", () => {
  it("blocks a third unsuccessful search, including simultaneous batches", () => {
    let state = emptyToolBudget("t");
    for (const id of ["1", "2"])
      state = finishTool(
        admitTools(state, [action(id)]),
        id,
        [{ connection: "mobility", description: "no tool match" }],
        false,
      );
    expect(() =>
      admitTools(state, [
        action("3", "connection_search", { query: "different" }),
      ]),
    ).toThrow("Two unsuccessful");
    expect(() =>
      admitTools(emptyToolBudget("t"), [action("1"), action("2"), action("3")]),
    ).toThrow();
    expect(
      admitTools(state, [action("4", "mobility__resolve_place")]),
    ).toBeDefined();
  });
  it("a discovered qualified tool is progress and result replay is idempotent", () => {
    const state = admitTools(emptyToolBudget("t"), [action("1")]);
    const done = finishTool(
      state,
      "1",
      [{ qualifiedName: "mobility__resolve_place" }],
      false,
    );
    expect(done.failedSearches).toBe(0);
    expect(finishTool(done, "1", [], false)).toEqual(done);
  });
  it("stops identical repeated results but allows a later refresh or new observation", () => {
    let state = emptyToolBudget("t");
    for (const id of ["1", "2"])
      state = finishTool(
        admitTools(state, [action(id, "mobility__get_parking")], 0),
        id,
        { observedAt: "a", spaces: null },
        false,
        0,
      );
    expect(() =>
      admitTools(state, [action("3", "mobility__get_parking")], 100),
    ).toThrow("without progress");
    state = finishTool(
      admitTools(state, [action("3", "mobility__get_parking")], 30001),
      "3",
      { observedAt: "b", spaces: null },
      false,
      30001,
    );
    expect(
      admitTools(state, [action("4", "mobility__get_parking")], 30002),
    ).toBeDefined();
  });
  it("bounds tool batches and payloads and rejects conflicting replay", () => {
    expect(() =>
      admitTools(
        emptyToolBudget("t"),
        Array.from({ length: 5 }, (_, i) => action(String(i))),
      ),
    ).toThrow("batch");
    const state = admitTools(emptyToolBudget("t"), [action("1")]);
    expect(() => admitTools(state, [action("1", "different")])).toThrow(
      "replay",
    );
    expect(() => finishTool(state, "1", "x".repeat(32001), false)).toThrow(
      "bounded",
    );
  });
});
