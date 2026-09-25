import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});
it.each(["00", "01"])(
  "accepts login %s and caches token without persisting login",
  async (code) => {
    vi.stubEnv("EMT_CLIENT_ID", "test-client");
    vi.stubEnv("EMT_PASSKEY", "test-key");
    const incident = {
      code: "00",
      data: [{ lastBuildDate: new Date().toUTCString(), item: [] }],
    };
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code,
            data: [{ accessToken: "test-token", tokenSecExpiration: 1800 }],
          }),
        ),
      )
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(incident))),
      );
    vi.stubGlobal("fetch", request);
    const { fetchEmtIncidents } = await import("./emt");
    const first = await fetchEmtIncidents();
    await fetchEmtIncidents();
    expect(request).toHaveBeenCalledTimes(3);
    expect(first.raw).not.toContain("test-token");
    expect(first.raw).not.toContain("test-key");
  },
);
it("fails closed on rejected authentication", async () => {
  vi.stubEnv("EMT_CLIENT_ID", "test-client");
  vi.stubEnv("EMT_PASSKEY", "test-key");
  const request = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ code: "84", data: [] })));
  vi.stubGlobal("fetch", request);
  const { fetchEmtIncidents } = await import("./emt");
  await expect(fetchEmtIncidents()).rejects.toThrow(
    "emt_authentication_failed",
  );
  expect(request).toHaveBeenCalledTimes(1);
});
it("invalidates rejected API tokens without immediate reauthentication loops", async () => {
  vi.stubEnv("EMT_CLIENT_ID", "test-client");
  vi.stubEnv("EMT_PASSKEY", "test-key");
  const login = () =>
    new Response(
      JSON.stringify({
        code: "00",
        data: [{ accessToken: "test-token", tokenSecExpiration: 1800 }],
      }),
    );
  const request = vi
    .fn()
    .mockResolvedValueOnce(login())
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "84", data: [] })),
    )
    .mockResolvedValueOnce(login())
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "00", data: [] })),
    );
  vi.stubGlobal("fetch", request);
  const { emtRequest } = await import("./emt-client");
  await expect(
    emtRequest("/v1/transport/busemtmad/stops/list/", []),
  ).rejects.toThrow("emt_data_unavailable");
  expect(request).toHaveBeenCalledTimes(2);
  await emtRequest("/v1/transport/busemtmad/stops/list/", []);
  expect(request).toHaveBeenCalledTimes(4);
});
