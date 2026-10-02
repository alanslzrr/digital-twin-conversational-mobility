import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  identity: vi.fn(),
  rate: vi.fn(),
  status: vi.fn(),
  renew: vi.fn(),
  catalog: vi.fn(),
  inspect: vi.fn(),
}));
vi.mock("../auth", () => ({ authorize: mocks.authorize }));
vi.mock("./access", async (original) => ({
  ...(await original<typeof import("./access")>()),
  readDashboardIdentity: mocks.identity,
}));
vi.mock("../better-auth", () => ({ getAuth: vi.fn() }));
vi.mock("../database", () => ({ database: vi.fn() }));
vi.mock("./rate-limit", () => ({ takeDashboardRate: mocks.rate }));
vi.mock("./queries", () => ({
  readDashboardStatus: mocks.status,
  renewDashboardActivity: mocks.renew,
}));
vi.mock("./inspector", () => ({ inspectStored: mocks.inspect }));
vi.mock("../tool-registry", () => ({ mobilityToolCatalog: mocks.catalog }));

import { GET, POST } from "../../app/internal/dashboard/[...path]/route";

const context = (path: string) => ({
  params: Promise.resolve({ path: path.split("/") }),
});
beforeEach(() => {
  mocks.authorize
    .mockReset()
    .mockResolvedValue({ subject: "runtime", scopes: [] });
  mocks.identity
    .mockReset()
    .mockResolvedValue({ evaluatorId: "synthetic-owner" });
  mocks.rate.mockReset().mockResolvedValue({ allowed: true });
  mocks.status.mockReset().mockResolvedValue({ marker: "stored-status" });
  mocks.renew.mockReset().mockResolvedValue({ marker: "activity" });
  mocks.catalog.mockReset();
});
it("requires the read JWT scope and Better Auth before reading status, without activity", async () => {
  const request = new Request("http://localhost/internal/dashboard/status", {
    headers: { cookie: "synthetic-cookie" },
  });
  const response = await GET(request, context("status"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.authorize).toHaveBeenCalledWith(
    request,
    expect.any(Object),
    "mobility.dashboard.read",
  );
  expect(mocks.identity).toHaveBeenCalledWith(request.headers);
  expect(mocks.rate).toHaveBeenCalledWith("synthetic-owner", "read");
  expect(mocks.renew).not.toHaveBeenCalled();
});
it("gives activity a separate scope/rate and requires a strictly empty body", async () => {
  const req = () =>
    new Request("http://localhost/internal/dashboard/activity", {
      method: "POST",
      body: "{}",
    });
  const request = req();
  expect((await POST(request, context("activity"))).status).toBe(200);
  expect(mocks.authorize).toHaveBeenLastCalledWith(
    request,
    expect.any(Object),
    "mobility.dashboard.activity",
  );
  expect(mocks.rate).toHaveBeenLastCalledWith("synthetic-owner", "activity");
  expect(mocks.renew).toHaveBeenCalledOnce();
  expect(
    (
      await POST(
        new Request("http://localhost/internal/dashboard/activity", {
          method: "POST",
          body: '{"enabled":true}',
        }),
        context("activity"),
      )
    ).status,
  ).toBe(400);
  expect(mocks.renew).toHaveBeenCalledOnce();
  expect(mocks.status).not.toHaveBeenCalled();
});
it("rejects service auth, inactive identity and rate failures before doing work", async () => {
  const req = () => new Request("http://localhost/internal/dashboard/status");
  mocks.authorize.mockResolvedValueOnce(new Response(null, { status: 403 }));
  expect((await GET(req(), context("status"))).status).toBe(403);
  expect(mocks.identity).not.toHaveBeenCalled();
  mocks.identity.mockRejectedValueOnce(new Error("private canary"));
  const denied = await GET(req(), context("status"));
  expect(denied.status).toBe(503);
  expect(await denied.text()).not.toContain("private canary");
  mocks.rate.mockResolvedValueOnce({ allowed: false, retryAfter: 42 });
  const limited = await GET(req(), context("status"));
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("42");
  expect(mocks.status).not.toHaveBeenCalled();
  expect(mocks.renew).not.toHaveBeenCalled();
});
it("has no generic proxy/fallback and rejects query arguments", async () => {
  const req = (suffix: string) =>
    new Request(`http://localhost/internal/dashboard/${suffix}`);
  expect((await GET(req("activity"), context("activity"))).status).toBe(404);
  expect(
    (await GET(req("unimplemented"), context("unimplemented"))).status,
  ).toBe(404);
  expect(
    (await GET(req("status?principalId=foreign"), context("status"))).status,
  ).toBe(400);
  expect(mocks.status).not.toHaveBeenCalled();
});

it("propagates oversized inspection as partial through the HTTP envelope", async () => {
  mocks.inspect.mockResolvedValue({
    schemaVersion: 1,
    tool: "get_network_status",
    executionMode: "stored_only",
    evaluatedAt: new Date().toISOString(),
    availability: "available",
    result: { description: "x".repeat(300000) },
    limitations: [],
  });
  const response = await POST(
    new Request("http://localhost/internal/dashboard/inspect", {
      method: "POST",
      body: JSON.stringify({ tool: "get_network_status", input: {} }),
    }),
    context("inspect"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    truncated: true,
    data: { availability: "partial", truncated: true },
  });
});
