import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), core: vi.fn() }));
vi.mock("../../../../src/evaluator-auth", async () => ({
  ...(await vi.importActual("../../../../src/evaluator-auth")),
  readIdentity: mocks.identity,
  coreAccess: mocks.core,
}));

import { GET } from "./route";

const timestamp = "2026-09-28T12:00:00.123456Z";
const page = {
  sessions: [{ sessionId: "own", createdAt: timestamp, expiresAt: timestamp }],
  nextCursor: null,
};
function request(query = "", headers = {}) {
  return new Request(
    `https://evaluation.example/api/evaluation/conversations${query}`,
    { headers },
  );
}
beforeEach(() => {
  vi.stubEnv("EVALUATION_ORIGIN", "https://evaluation.example");
  mocks.identity.mockResolvedValue({
    principalId: "trusted",
    label: "Evaluator",
  });
  mocks.core.mockResolvedValue(Response.json(page));
});
it("uses server identity and returns only validated metadata without caching", async () => {
  const result = await GET(request());
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(page);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(mocks.core).toHaveBeenCalledWith({
    action: "list_sessions",
    principalId: "trusted",
  });
});
it("rejects browser owner injection and invalid or repeated cursors", async () => {
  for (const query of [
    "?principalId=other",
    "?cursor=no",
    "?cursor={}",
    "?cursor=1&cursor=2",
  ])
    expect((await GET(request(query))).status).toBe(400);
  expect(mocks.core).not.toHaveBeenCalled();
});
it("preserves a validated microsecond cursor", async () => {
  const cursor = { createdAt: timestamp, sessionId: "s1" };
  expect(
    (
      await GET(
        request(`?cursor=${encodeURIComponent(JSON.stringify(cursor))}`),
      )
    ).status,
  ).toBe(200);
  expect(mocks.core).toHaveBeenCalledWith({
    action: "list_sessions",
    principalId: "trusted",
    cursor,
  });
});
it("rejects cross-site and unauthenticated access", async () => {
  expect(
    (await GET(request("", { "sec-fetch-site": "cross-site" }))).status,
  ).toBe(403);
  mocks.identity.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401);
  expect(mocks.core).not.toHaveBeenCalled();
});
it("does not disguise service or malformed response errors as an empty list", async () => {
  mocks.core.mockResolvedValue(
    Response.json({ error: "unavailable" }, { status: 503 }),
  );
  expect((await GET(request())).status).toBe(503);
  mocks.core.mockResolvedValue(
    Response.json({ ...page, secret: "unexpected" }),
  );
  expect((await GET(request())).status).toBe(503);
});
