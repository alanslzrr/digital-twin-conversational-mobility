import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), sql: vi.fn() }));
vi.mock("./mobility", () => ({ snapshot: mocks.snapshot }));
vi.mock("./database", () => ({ database: () => mocks.sql }));

import { dgtIncidents } from "./dgt";

beforeEach(() => {
  mocks.snapshot.mockResolvedValue({
    provenance: { source: "dgt" },
    freshness: { status: "stale" },
    payload: {
      incidents: [
        {
          id: "fixture:unknown-location",
          road: null,
          location: { type: "unknown", start: null, end: null },
          informationStatus: "real",
          providerValidity: "planned",
          startsAt: "2026-09-28T12:00:00Z",
          endsAt: null,
          complexValidity: false,
        },
      ],
    },
  });
});
it("retains unknown locations when no geographic filter was requested", async () => {
  expect(await dgtIncidents({ limit: 5 }, false)).toMatchObject({
    total: 1,
    incidents: [
      { id: "fixture:unknown-location", location: { type: "unknown" } },
    ],
    freshness: { status: "stale" },
  });
  expect(mocks.snapshot).toHaveBeenCalledWith("dgt-incidents", false);
});
it("does not invent a geographic match for unknown locations", async () => {
  expect(
    await dgtIncidents({ query: "Madrid", limit: 5 }, false),
  ).toMatchObject({ total: 0, incidents: [] });
});
