import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWeatherProduct, weatherResponse } from "./journey-weather";

const previous = {
  product: "warnings" as const,
  issuedAt: "2026-09-28T00:00:00.000Z",
  validFrom: "2026-09-28T00:00:00Z",
  validTo: "2026-09-29T00:00:00Z",
  records: [],
};
const signal = () => AbortSignal.timeout(1000);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("bounded conditional acquisition", () => {
  it("rejects 304 without local state; valid 304 sends conditional header", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      fetchWeatherProduct("warnings:28", signal(), {
        payload: null,
        lastModified: "date",
      }),
    ).rejects.toThrow("weather_304_without_state");
    expect(fetch.mock.calls[0]?.[1].headers).toEqual({});
    expect(
      await fetchWeatherProduct("warnings:28", signal(), {
        payload: previous,
        lastModified: "date",
      }),
    ).toEqual({ notModified: true });
    expect(fetch.mock.calls[1]?.[1].headers).toEqual({
      "If-Modified-Since": "date",
    });
  });
  it("does not redownload the complete archive when an unchanged index returns 200", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          '<feed><entry><updated>2026-09-28T00:00:00Z</updated><link href="https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/cap/Z_CAP_C_LEMM_20260928000000_AFAP7228.tar.gz"/></entry></feed>',
        ),
      );
    vi.stubGlobal("fetch", fetch);
    expect(
      await fetchWeatherProduct("warnings:28", signal(), {
        payload: previous,
        lastModified: null,
      }),
    ).toEqual({ notModified: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("honors Retry-After without retaining operational URLs or secrets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 429,
          headers: { "Retry-After": "120" },
        }),
      ),
    );
    await expect(
      weatherResponse("https://www.aemet.es/", signal()),
    ).rejects.toMatchObject({
      status: 429,
      retryAfter: 120,
      message: "upstream_http_429",
    });
  });
  it("rejects oversized bodies and aborts the pending provider request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("x".repeat(2000001))),
    );
    await expect(
      weatherResponse("https://www.aemet.es/", signal()),
    ).rejects.toThrow("weather_body_limit");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_u, { signal }) =>
          new Promise((_r, reject) =>
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            }),
          ),
      ),
    );
    await expect(
      weatherResponse("https://www.aemet.es/", AbortSignal.timeout(30)),
    ).rejects.toThrow();
  });
});
