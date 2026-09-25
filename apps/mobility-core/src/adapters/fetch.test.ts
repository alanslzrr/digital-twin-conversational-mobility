import { afterEach, expect, it, vi } from "vitest";
import { fetchText } from "./common";

afterEach(() => vi.unstubAllGlobals());
it("retries one connection failure", async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("fetch failed"))
    .mockResolvedValue(new Response("ok"));
  vi.stubGlobal("fetch", request);
  expect(await fetchText("https://example.invalid")).toBe("ok");
  expect(request).toHaveBeenCalledTimes(2);
});
it("bounds failures and does not retry HTTP denials", async () => {
  const request = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
  vi.stubGlobal("fetch", request);
  await expect(fetchText("https://example.invalid")).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(2);
  request.mockReset().mockResolvedValue(new Response("", { status: 403 }));
  await expect(fetchText("https://example.invalid")).rejects.toThrow(
    "upstream_http_403",
  );
  expect(request).toHaveBeenCalledTimes(1);
});
