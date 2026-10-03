import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { State } from "./shared";
import { Sources } from "./source-view";

vi.stubGlobal("React", React);
const reads = vi.hoisted(() => ({
  source: undefined as unknown,
  error: null as unknown,
}));
vi.mock("@/src/dashboard-client", () => ({
  useDashboard: (path: string) =>
    path === "status"
      ? {
          data: {
            workers: [
              { id: 0, state: "running", lastSeenAt: "2026-10-03T08:00:00Z" },
            ],
          },
          isLoading: false,
          error: null,
        }
      : { data: reads.source, error: reads.error, isLoading: false },
}));
afterEach(() => {
  reads.source = undefined;
  reads.error = null;
});
it("first source failure never displays empty groups or false issue totals, despite worker success", () => {
  reads.error = new Error("Synthetic read failure");
  const html = renderToStaticMarkup(React.createElement(Sources));
  expect(html).toContain("Source evidence unavailable");
  expect(html).toContain("Active signal");
  expect(html).not.toContain("No registered products");
  expect(html).not.toContain("Products with recorded current issues");
  expect(html).not.toContain("Source products");
});
it("cached source failure retains successful data separately from workers", () => {
  reads.source = {
    readAt: "2026-10-03T08:00:00Z",
    data: {
      sources: [{ id: "bicimad", enabled: true, streams: [] }],
      metrics: { issueProducts: [], monitoredProducts: 1, errors: null },
    },
  };
  reads.error = new Error("Synthetic refresh failure");
  const html = renderToStaticMarkup(React.createElement(Sources));
  expect(html).toContain("Previously loaded evidence");
  expect(html).toContain("BiciMAD");
  expect(html).toContain("Unknown");
});
it("an error never uses the successful empty message", () => {
  const html = renderToStaticMarkup(
    React.createElement(State, {
      loading: false,
      error: new Error(),
      empty: true,
    }),
  );
  expect(html).toContain("not an empty result");
  expect(html).not.toContain("No stored records");
});
