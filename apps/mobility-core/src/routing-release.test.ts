import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { coveredFeeds, routingRelease } from "./routing-release";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  readFile: vi.fn(),
  sql: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  access: mocks.access,
  readFile: mocks.readFile,
}));
vi.mock("./database", () => ({ database: () => mocks.sql }));
const manifest = {
  releaseId: "a".repeat(64),
  staticVersion: "r",
  catalogs: { metro: "expired", emt: "e" },
  feeds: {
    renfe: {
      version: "r",
      serviceStart: "2026-09-01",
      serviceEnd: "2026-10-01",
    },
    emt: { version: "e", serviceStart: "2026-09-01", serviceEnd: "2026-12-31" },
  },
  coverage: "test",
};
beforeEach(() => {
  mocks.access
    .mockReset()
    .mockRejectedValue(Object.assign(new Error(), { code: "ENOENT" }));
  mocks.readFile.mockReset().mockResolvedValue(JSON.stringify(manifest));
  mocks.sql
    .mockReset()
    .mockImplementation(async (query: TemplateStringsArray) =>
      query.join("").includes("routing_release")
        ? [
            {
              id: manifest.releaseId,
              manifest: { otpVerifiedAt: "2026-09-25" },
            },
          ]
        : query.join("").includes("crtm_feed")
          ? [
              { dataset_id: "metro", version: "expired" },
              { dataset_id: "emt", version: "e" },
            ]
          : [{ version: "r" }],
    );
});
afterEach(() => vi.restoreAllMocks());
it("verifies active catalog versions and allows EMT after Renfe envelope ends", async () => {
  expect(await routingRelease()).toEqual(manifest);
  expect(coveredFeeds(manifest, "2026-10-15T10:00:00Z")).toEqual(["emt"]);
});
it("blocks queries during a journaled update before database access", async () => {
  mocks.access.mockResolvedValue(undefined);
  await expect(routingRelease()).rejects.toThrow("routing_update_in_progress");
  expect(mocks.sql).not.toHaveBeenCalled();
});
it("fails closed on catalog mismatch and unverified OTP release", async () => {
  mocks.sql.mockResolvedValueOnce([{ id: "wrong", manifest: {} }]);
  await expect(routingRelease()).rejects.toThrow(
    "graph_static_version_mismatch",
  );
  mocks.sql
    .mockResolvedValueOnce([
      { id: manifest.releaseId, manifest: { otpVerifiedAt: "date" } },
    ])
    .mockResolvedValueOnce([{ dataset_id: "emt", version: "wrong" }]);
  await expect(routingRelease()).rejects.toThrow(
    "graph_static_version_mismatch",
  );
});
