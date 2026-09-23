import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedBrowserRequest, readBoundedJson } from "./evaluator-auth";

afterEach(() => vi.unstubAllEnvs());
describe("browser boundary", () => {
  it("requires exact configured origin for mutation", () => {
    vi.stubEnv("EVALUATION_ORIGIN", "https://evaluation.example");
    expect(
      allowedBrowserRequest(
        new Request("https://evaluation.example", { method: "POST" }),
      ),
    ).toBe(false);
    expect(
      allowedBrowserRequest(
        new Request("https://evaluation.example", {
          method: "POST",
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toBe(false);
    expect(
      allowedBrowserRequest(
        new Request("https://evaluation.example", {
          method: "POST",
          headers: { origin: "https://evaluation.example" },
        }),
      ),
    ).toBe(true);
  });
  it("rejects cross-site reads and missing configuration", () => {
    vi.stubEnv("EVALUATION_ORIGIN", "");
    expect(allowedBrowserRequest(new Request("http://localhost"))).toBe(false);
    vi.stubEnv("EVALUATION_ORIGIN", "http://localhost");
    expect(
      allowedBrowserRequest(
        new Request("http://localhost", {
          headers: { "sec-fetch-site": "cross-site" },
        }),
      ),
    ).toBe(false);
  });
  it("bounds decoded JSON even without content-length", async () => {
    await expect(
      readBoundedJson(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ message: "x".repeat(100) }),
        }),
        20,
      ),
    ).rejects.toThrow("Request too large");
  });
});
