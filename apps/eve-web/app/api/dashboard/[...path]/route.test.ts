import { beforeEach, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ identity: vi.fn(), core: vi.fn() }));
vi.mock("../../../../src/evaluator-auth", () => ({
  allowedBrowserRequest: (r: Request) =>
    r.headers.get("sec-fetch-site") !== "cross-site",
  readIdentity: f.identity,
}));
vi.mock("../../../../data/queries/dashboard", () => ({
  coreDashboard: f.core,
}));

import { GET, POST } from "./route";

const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });
beforeEach(() => {
  f.identity.mockResolvedValue({ principalId: "owned" });
  f.core.mockResolvedValue(Response.json({ schemaVersion: 1 }));
});
it("denies anonymous and cross-site before forwarding", async () => {
  f.identity.mockResolvedValue(null);
  expect(
    (
      await GET(
        new Request("http://localhost/api/dashboard/status"),
        ctx(["status"]),
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await POST(
        new Request("http://localhost/api/dashboard/activity", {
          method: "POST",
          headers: { "sec-fetch-site": "cross-site" },
        }),
        ctx(["activity"]),
      )
    ).status,
  ).toBe(403);
  expect(f.core).not.toHaveBeenCalled();
});
it("never acts as arbitrary URL, writer, SQL or unknown path proxy", async () => {
  for (const path of [
    ["https:", "evil.example"],
    ["telemetry"],
    ["sql"],
    ["activity", "extra"],
  ])
    expect(
      (await GET(new Request("http://localhost/api/dashboard/x"), ctx(path)))
        .status,
    ).toBe(404);
  expect(f.core).not.toHaveBeenCalled();
});
it("allows only fixed authenticated reader and explicit writer routes", async () => {
  expect(
    (
      await GET(
        new Request("http://localhost/api/dashboard/status"),
        ctx(["status"]),
      )
    ).status,
  ).toBe(200);
  expect(f.core).toHaveBeenCalledWith(expect.any(Request), "status");
  expect(
    (
      await POST(
        new Request("http://localhost/api/dashboard/tools", { method: "POST" }),
        ctx(["tools"]),
      )
    ).status,
  ).toBe(404);
});
