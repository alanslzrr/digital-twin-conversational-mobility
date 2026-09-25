import { describe, expect, it, vi } from "vitest";
import { budgetedFetch, responseUsage } from "./budgeted-fetch";

const endpoint = "https://api.openai.com/v1/responses";
const context = () => ({
  principalId: "p",
  sessionId: "s",
  turnId: "t",
  stepIndex: 0,
  purpose: "step" as const,
});
const request = (extra = {}) => ({
  method: "POST",
  headers: { Authorization: "Bearer not-a-secret" },
  body: JSON.stringify({ model: "gpt-6-luna", input: "hello", ...extra }),
});
const json = (body: unknown, status = 200) => Response.json(body, { status });
function setup(
  response: () => Response = () =>
    json({
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        input_tokens_details: { cached_tokens: 80 },
      },
    }),
) {
  const access = vi.fn(async (action: Record<string, unknown>) =>
    json(
      action.action === "budget_begin"
        ? {
            inputLimit: 1000,
            outputLimit: 100,
            deadline: new Date(Date.now() + 59_000).toISOString(),
          }
        : { ok: true },
    ),
  );
  const network = vi.fn<typeof fetch>(async (url) =>
    String(url).endsWith("/input_tokens")
      ? json({ object: "response.input_tokens", input_tokens: 100 })
      : response(),
  );
  return { access, network, fetch: budgetedFetch(context, access, network) };
}
describe("provider budget transport (no network)", () => {
  it("reserves before counting and dispatch, clamps output and disables storage", async () => {
    const test = setup();
    const response = await test.fetch(
      endpoint,
      request({ max_output_tokens: 999999, store: true }),
    );
    expect(response.status).toBe(200);
    expect(test.access.mock.calls.map(([a]) => a.action)).toEqual([
      "budget_begin",
      "budget_dispatch",
      "budget_finish",
    ]);
    expect(test.access.mock.invocationCallOrder[0]).toBeLessThan(
      test.network.mock.invocationCallOrder[0] ?? 0,
    );
    expect(
      JSON.parse(String(test.network.mock.calls[1]?.[1]?.body)),
    ).toMatchObject({ max_output_tokens: 100, store: false });
    expect(test.access.mock.calls[2]?.[0]).toMatchObject({
      usage: { input: 100, output: 20, cached: 80 },
      notSent: false,
    });
  });
  it("refuses all network traffic with no approved campaign", async () => {
    const test = setup();
    test.access.mockResolvedValue(json({}, 429));
    await expect(test.fetch(endpoint, request())).rejects.toThrow("budget");
    expect(test.network).not.toHaveBeenCalled();
  });
  it("counts tools and instructions, refuses an over-budget input before generation", async () => {
    const test = setup();
    test.network.mockResolvedValue(
      json({ object: "response.input_tokens", input_tokens: 1001 }),
    );
    const tools = [
      { type: "function", name: "route", parameters: { type: "object" } },
    ];
    await expect(
      test.fetch(endpoint, request({ instructions: "fixed", tools })),
    ).rejects.toThrow();
    expect(test.network).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(String(test.network.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({ instructions: "fixed", tools });
    expect(test.access.mock.calls.at(-1)?.[0]).toMatchObject({
      notSent: true,
      usage: null,
    });
  });
  it("every retry/compaction invocation requests a separate reservation", async () => {
    const test = setup();
    await test.fetch(endpoint, request());
    await test.fetch(endpoint, request());
    const ids = test.access.mock.calls
      .filter(([a]) => a.action === "budget_begin")
      .map(([a]) => a.attemptId);
    expect(new Set(ids).size).toBe(2);
    const compact = budgetedFetch(
      () => ({ ...context(), purpose: "compaction" }),
      test.access,
      test.network,
    );
    await compact(endpoint, request());
    expect(test.access.mock.calls.at(-3)?.[0]).toMatchObject({
      purpose: "compaction",
    });
  });
  it("never refunds an ambiguous dispatch response or provider error", async () => {
    const test = setup(() => json({ error: "private failure" }, 500));
    await expect(test.fetch(endpoint, request())).rejects.toThrow("budget");
    expect(test.access.mock.calls.at(-1)?.[0]).toMatchObject({
      notSent: false,
      usage: null,
    });
    test.access.mockImplementation(async (a) => {
      if (a.action === "budget_dispatch") throw new Error("lost response");
      return json(
        a.action === "budget_begin"
          ? {
              inputLimit: 1000,
              outputLimit: 100,
              deadline: new Date(Date.now() + 59000).toISOString(),
            }
          : {},
      );
    });
    await expect(test.fetch(endpoint, request())).rejects.toThrow("budget");
    expect(test.access.mock.calls.at(-1)?.[0]).toMatchObject({
      notSent: false,
    });
  });
  it("streams bytes unchanged and reconciles split SSE final usage", async () => {
    const text =
      'data: {"type":"response.output_text.delta","delta":"Colón"}\n\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":100,"output_tokens":20}}}\n\ndata: [DONE]\n\n';
    const bytes = new TextEncoder().encode(text);
    const test = setup(
      () =>
        new Response(
          new ReadableStream({
            start(c) {
              for (const byte of bytes) c.enqueue(Uint8Array.of(byte));
              c.close();
            },
          }),
        ),
    );
    const response = await test.fetch(endpoint, request({ stream: true }));
    expect(await response.text()).toBe(text);
    expect(test.access.mock.calls.at(-1)?.[0]).toMatchObject({
      usage: { input: 100, output: 20, cached: null },
    });
  });
  it("retains unknown usage when a stream closes without terminal usage or is cancelled", async () => {
    const test = setup(
      () =>
        new Response(
          'data: {"type":"response.output_text.delta","delta":"x"}\n\n',
        ),
    );
    await (await test.fetch(endpoint, request({ stream: true }))).text();
    expect(test.access.mock.calls.at(-1)?.[0]).toMatchObject({
      usage: null,
      notSent: false,
    });
    const stalled = setup(
      () =>
        new Response(
          new ReadableStream({
            pull(c) {
              c.enqueue(new TextEncoder().encode(": ping\n\n"));
            },
          }),
        ),
    );
    const response = await stalled.fetch(endpoint, request({ stream: true }));
    await response.body?.cancel();
    expect(stalled.access.mock.calls.at(-1)?.[0]).toMatchObject({
      usage: null,
      notSent: false,
    });
  });
  it.each([
    { model: "other" },
    { tools: [{ type: "web_search" }] },
    { previous_response_id: "resp_old" },
    { background: true },
  ])("rejects unbudgeted provider features %j", async (override) => {
    const test = setup();
    await expect(test.fetch(endpoint, request(override))).rejects.toThrow();
    expect(test.network).not.toHaveBeenCalled();
  });
  it("does not send credentials to another endpoint or follow redirects", async () => {
    const test = setup();
    await expect(
      test.fetch("https://example.com", request()),
    ).rejects.toThrow();
    expect(test.network).not.toHaveBeenCalled();
    await test.fetch(endpoint, request());
    expect(test.network.mock.calls[1]?.[1]?.redirect).toBe("error");
  });
  it("cancellation after token counting prevents inference and only refunds undispatched tokens", async () => {
    const test = setup();
    const abort = new AbortController();
    test.network.mockImplementation(async () => {
      abort.abort();
      return json({ object: "response.input_tokens", input_tokens: 100 });
    });
    await expect(
      test.fetch(endpoint, { ...request(), signal: abort.signal }),
    ).rejects.toThrow("budget");
    expect(test.network).toHaveBeenCalledTimes(1);
    expect(test.access.mock.calls.at(-1)?.[0]).toMatchObject({
      notSent: true,
      usage: null,
    });
    expect(
      test.access.mock.calls.some(([a]) => a.action === "budget_dispatch"),
    ).toBe(false);
  });
  it("an expired admission and a failed accounting service cannot dispatch", async () => {
    const test = setup();
    test.access.mockResolvedValue(
      json({
        inputLimit: 1000,
        outputLimit: 100,
        deadline: new Date(Date.now() - 1).toISOString(),
      }),
    );
    await expect(test.fetch(endpoint, request())).rejects.toThrow();
    expect(test.network).not.toHaveBeenCalled();
    test.access.mockRejectedValue(new Error("accounting offline"));
    await expect(test.fetch(endpoint, request())).rejects.toThrow();
    expect(test.network).not.toHaveBeenCalled();
  });
  it("never interprets invalid or missing usage as zero", () => {
    expect(responseUsage({})).toBeNull();
    expect(responseUsage({ input_tokens: 1, output_tokens: -1 })).toBeNull();
    expect(
      responseUsage({
        input_tokens: 1,
        output_tokens: 0,
        input_tokens_details: { cached_tokens: 2 },
      }),
    ).toBeNull();
    expect(responseUsage({ input_tokens: 0, output_tokens: 0 })).toEqual({
      input: 0,
      output: 0,
      cached: null,
    });
  });
});
