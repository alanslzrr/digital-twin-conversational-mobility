import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  enabled: vi.fn(),
  activate: vi.fn(),
}));
vi.mock("../database", () => ({ database: () => mocks.sql }));
vi.mock("../ingestion", () => ({
  ingestionEnabled: mocks.enabled,
  activate: mocks.activate,
}));

import { readDashboardStatus, renewDashboardActivity } from "./queries";

const time = "2026-10-02T12:00:00.123Z";
beforeEach(() => {
  mocks.enabled.mockReset().mockReturnValue(true);
  mocks.activate.mockReset().mockResolvedValue(undefined);
  mocks.sql
    .mockReset()
    .mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join("");
      if (query.includes("ingestion_activity"))
        return [{ active_until: new Date(time), active: true }];
      if (query.includes("ingestion_worker"))
        return [
          { id: 0, last_seen_at: new Date(time), last_pruned_at: null, age: 5 },
          { id: 1, last_seen_at: null, last_pruned_at: null, age: null },
        ];
      if (query.includes("mobility_snapshot"))
        return [{ id: "snapshot:bicimad", revision: "stored-revision" }];
      throw new Error("Unexpected query");
    });
});
it("reads bounded public status without acquisition or pretending traces are installed", async () => {
  const status = await readDashboardStatus();
  expect(status).toMatchObject({
    activeUntil: time,
    workers: [
      { id: "0", lastSeenAt: time, state: "running" },
      { id: "1", lastSeenAt: null, state: "not_seen" },
    ],
    captureCoverage: "best_effort",
    captureVersion: 1,
  });
  expect(mocks.activate).not.toHaveBeenCalled();
  expect(mocks.sql).toHaveBeenCalledTimes(3);
  expect(Buffer.byteLength(JSON.stringify(status))).toBeLessThan(16384);
});
it("reports disabled ingestion separately from worker heartbeat and fresh stored data", async () => {
  mocks.enabled.mockReturnValue(false);
  const status = await readDashboardStatus();
  expect(status.ingestionEnabled).toBe(false);
  expect(status.workers.every((worker) => worker.state === "disabled")).toBe(
    true,
  );
  expect(mocks.activate).not.toHaveBeenCalled();
});
it("renews once through the existing activator without running ticks or querying providers", async () => {
  expect(await renewDashboardActivity()).toMatchObject({
    enabled: true,
    activeUntil: time,
  });
  expect(mocks.activate).toHaveBeenCalledOnce();
  expect(mocks.sql).toHaveBeenCalledOnce();
});
