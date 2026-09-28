import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  incidents: vi.fn(),
  health: vi.fn(),
}));
vi.mock("./database", () => ({ database: () => mocks.sql }));
vi.mock("./mobility", () => ({
  incidents: mocks.incidents,
  sourceHealth: mocks.health,
}));

import { lineStatus, mobilitySnapshot, networkStatus } from "./aggregates";
import { summarizePayload } from "./evidence-summary";

beforeEach(() => {
  mocks.incidents.mockResolvedValue({
    status: "available",
    incidents: [],
    lineIdentity: { status: "known" },
  });
  mocks.health.mockResolvedValue({
    asOf: "2026-09-28T15:00:00Z",
    activityWindow: "inactive",
    workers: [],
    sources: [
      {
        id: "renfe",
        status: "partial_or_unavailable",
        capability: "dynamic_observations",
        streams: [
          {
            id: "renfe-alerts",
            freshness: { status: "stale", ageSeconds: 500 },
            provenance: { observedAt: "2026-09-28T14:00:00Z" },
            summary: { totals: { alerts: 0 } },
          },
        ],
      },
      {
        id: "bicimad",
        status: "partial_or_unavailable",
        streams: [{ entityCoverage: { fresh: 0, stale: 678 } }],
      },
    ],
  });
});
it("reuses notices without on-demand ingestion and never declares normal service", async () => {
  const result = await lineStatus({ source: "renfe", line: "C-5", limit: 5 });
  expect(mocks.incidents).toHaveBeenCalledWith(
    expect.objectContaining({ source: "renfe", line: "C-5" }),
    false,
  );
  expect(result).toMatchObject({
    serviceStatus: "not_established",
    incidents: [],
  });
  expect(result.warning).toContain("do not establish normal");
});
it("requires a CRTM namespace and rejects mixed network/operator filters", async () => {
  expect(
    await lineStatus({ source: "crtm", line: "1", limit: 5 }),
  ).toMatchObject({ status: "needs_clarification" });
  expect(
    await lineStatus({ source: "emt", network: "metro", line: "1", limit: 5 }),
  ).toMatchObject({ reason: "network_filter_requires_crtm" });
  expect(mocks.sql).not.toHaveBeenCalled();
});
it("keeps expired static identity separate from current service and missing notices", async () => {
  mocks.sql
    .mockResolvedValueOnce([
      { version: "v", service_start: "2020-01-01", service_end: "2020-02-01" },
    ])
    .mockResolvedValueOnce([
      { external_id: "m1", short_name: "1", long_name: "one" },
    ]);
  expect(
    await lineStatus({ source: "crtm", network: "metro", line: "1", limit: 5 }),
  ).toMatchObject({
    status: "known_line",
    staticCatalog: { currentServiceEnvelope: false },
    notices: { status: "unavailable" },
    serviceStatus: "not_established",
  });
});
it("preserves per-source age and entity coverage without provider calls", async () => {
  const view = await mobilitySnapshot();
  expect(view.status).toBe("partial_coverage");
  expect(view.components[0]?.streams[0]).toMatchObject({
    freshness: { status: "stale", ageSeconds: 500 },
  });
  expect(view.components[1]?.streams[0]).toMatchObject({
    entityCoverage: { fresh: 0, stale: 678 },
  });
  expect(mocks.incidents).not.toHaveBeenCalled();
});
it("filters networks without presenting bicycle stations as a transit network", async () => {
  expect((await networkStatus()).components.map((c) => c.source)).toEqual([
    "renfe",
  ]);
});
it("labels totals as retained evidence, not synchronized live readings", () => {
  expect(summarizePayload("bicimad", { stations: [{}, {}] })).toEqual({
    totals: { stations: 2 },
  });
});

it("sample freshness never borrows the newest collection timestamp", () => {
  const now = Date.parse("2026-09-28T15:00:00Z");
  const provenance = {
    source: "bicimad" as const,
    observedAt: new Date(now).toISOString(),
    ingestedAt: new Date(now).toISOString(),
    quality: "provisional" as const,
  };
  const summary = summarizePayload(
    "bicimad",
    {
      stations: [
        { id: "old", bikes: 7, observedAt: "2026-09-27T15:00:00Z" },
        { id: "missing", bikes: 5 },
      ],
    },
    now,
    provenance,
  );
  expect(summary).toMatchObject({
    samples: [
      { id: "old", freshness: { status: "stale", ageSeconds: 86400 } },
      { id: "missing", freshness: { status: "unavailable" } },
    ],
  });
});
