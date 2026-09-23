import type { HttpRouteDefinition, RouteHandlerArgs } from "eve/channels";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { protectEvaluationRoute } from "./evaluation-guard";
import { coreAccess, readIdentity } from "./evaluator-auth";

vi.mock("./evaluator-auth", async (original) => ({
  ...(await original<typeof import("./evaluator-auth")>()),
  coreAccess: vi.fn(),
  readIdentity: vi.fn(),
  allowedBrowserRequest: () => true,
}));
const core = vi.mocked(coreAccess);
const identity = vi.mocked(readIdentity);
const user = { principalId: "alice", label: "Alice" };
beforeEach(() => {
  vi.clearAllMocks();
  identity.mockResolvedValue(user);
  core.mockImplementation(async () => Response.json({ ok: true }));
});
function fixture(
  path: string,
  method: "GET" | "POST" = "POST",
  params: Record<string, string> = { sessionId: "owned" },
) {
  const handler = vi.fn(async () =>
    Response.json({ sessionId: "created" }, { status: 202 }),
  );
  const route: HttpRouteDefinition = { path, method, handler };
  const wrapped = protectEvaluationRoute(route);
  const invoke = (body = {}) =>
    wrapped.handler(
      new Request(`http://localhost${path}`, {
        method,
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      }),
      { params } as RouteHandlerArgs,
    );
  return { handler, invoke };
}
describe("EVE session authorization", () => {
  it("denies anonymous requests before dispatch and persistence", async () => {
    identity.mockResolvedValue(null);
    const route = fixture("/eve/v1/session", "POST", {});
    expect((await route.invoke()).status).toBe(401);
    expect(route.handler).not.toHaveBeenCalled();
    expect(core).not.toHaveBeenCalled();
  });
  it.each(["", "/cancel", "/compact", "/clear", "/reset", "/stream"])(
    "denies cross-owner %s",
    async (suffix) => {
      core.mockResolvedValue(Response.json({}, { status: 403 }));
      const route = fixture(
        `/eve/v1/session/:sessionId${suffix}`,
        suffix === "/stream" ? "GET" : "POST",
      );
      expect((await route.invoke()).status).toBe(403);
      expect(route.handler).not.toHaveBeenCalled();
      expect(core).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "owned", principalId: "alice" }),
      );
    },
  );
  it("authorizes parent ownership before subagent streaming", async () => {
    const route = fixture(
      "/eve/v1/session/:parentSessionId/subagents/:callId/:childSessionId/stream",
      "GET",
      { parentSessionId: "parent", childSessionId: "child" },
    );
    await route.invoke();
    expect(core).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "parent" }),
    );
  });
  it("registers owner before returning the new session ID", async () => {
    const route = fixture("/eve/v1/session", "POST", {});
    expect((await route.invoke({ message: "Hello" })).status).toBe(202);
    expect(core).toHaveBeenLastCalledWith({
      action: "register",
      principalId: "alice",
      sessionId: "created",
    });
  });
  it("fails closed when ownership storage or quota is unavailable", async () => {
    core.mockRejectedValue(new Error("offline"));
    const route = fixture("/eve/v1/session", "POST", {});
    expect((await route.invoke()).status).toBe(503);
    expect(route.handler).not.toHaveBeenCalled();
    core.mockResolvedValue(Response.json({}, { status: 429 }));
    expect((await route.invoke()).status).toBe(429);
    expect(route.handler).not.toHaveBeenCalled();
  });
  it("does not reveal an orphan ID if owner registration fails", async () => {
    core
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(Response.json({}, { status: 503 }));
    expect((await fixture("/eve/v1/session", "POST", {}).invoke()).status).toBe(
      503,
    );
  });
  it("rejects callback injection before dispatch", async () => {
    const route = fixture("/eve/v1/session", "POST", {});
    expect(
      (await route.invoke({ callback: { url: "https://evil.example" } }))
        .status,
    ).toBe(400);
    expect(route.handler).not.toHaveBeenCalled();
  });
});
