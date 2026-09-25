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

it("classifies bounded connection, DNS and certificate causes without exposing messages", async () => {
  const { sourceErrorCode } = await import("./common");
  for (const [code, expected] of [
    ["UND_ERR_CONNECT_TIMEOUT", "upstream_connection_timeout"],
    ["ETIMEDOUT", "upstream_connection_timeout"],
    ["ENOTFOUND", "upstream_dns_error"],
    ["EAI_AGAIN", "upstream_dns_error"],
    ["CERT_HAS_EXPIRED", "upstream_tls_error"],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "upstream_tls_error"],
    ["some-secret-provider-payload", "upstream_network_error"],
  ]) {
    expect(
      sourceErrorCode(
        new TypeError("secret URL", {
          cause: Object.assign(new Error("private"), { code }),
        }),
      ),
    ).toBe(expected);
  }
});
