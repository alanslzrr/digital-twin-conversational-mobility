import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";

const sink = vi.hoisted(() => vi.fn());
vi.mock("./telemetry", async (original) => ({
  ...(await original<typeof import("./telemetry")>()),
  sendTelemetry: sink,
}));

import { budgetedFetch } from "./budgeted-fetch";

const endpoint = "https://api.openai.com/v1/responses";
const scope = () => ({
  principalId: randomUUID(),
  sessionId: "synthetic",
  turnId: "turn1",
  stepIndex: 0,
  purpose: "step" as const,
});
beforeEach(() => {
  sink.mockReset();
  sink.mockResolvedValue(undefined);
});
it("captures effective request, self-contained terminal and exact sent tool call IDs", async () => {
  const network = vi.fn<typeof fetch>(async () =>
    Response.json({
      id: "response1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ type: "output_text", text: "answer" }],
        },
        { type: "reasoning", encrypted_content: "canary" },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 4,
        input_tokens_details: { cached_tokens: 2 },
      },
    }),
  );
  const fetcher = budgetedFetch(scope, vi.fn(), network, "interactive");
  const result = await fetcher(endpoint, {
    method: "POST",
    headers: { Authorization: "Bearer canary" },
    body: JSON.stringify({
      model: "gpt-6-luna",
      store: true,
      max_output_tokens: 999999,
      input: [
        {
          type: "function_call_output",
          call_id: "call_exact",
          output: '{"status":"found"}',
        },
      ],
    }),
  });
  expect(result.status).toBe(200);
  const prepared = sink.mock.calls.find(
    (c) => c[2][0].kind === "attempt_prepared",
  );
  const terminal = sink.mock.calls.find(
    (c) => c[2][0].kind === "attempt_completed",
  );
  expect(prepared?.[3]).toHaveLength(1);
  expect(terminal?.[2][0]).toMatchObject({
    sentCallIds: ["call_exact"],
    providerResponseId: "response1",
    usage: { inputTokens: 10, outputTokens: 4, cachedInputTokens: 2 },
  });
  expect(terminal?.[3]).toHaveLength(2);
  expect(JSON.stringify(sink.mock.calls)).not.toContain("canary");
  expect(network).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(network.mock.calls[0]?.[1]?.body))).toMatchObject({
    store: false,
    max_output_tokens: 2048,
  });
});
it("sink rejection cannot fail inference or trigger another provider attempt", async () => {
  sink.mockRejectedValue(new Error("observer offline"));
  const network = vi.fn<typeof fetch>(async () =>
    Response.json({
      status: "completed",
      output: [],
      usage: { input_tokens: 3, output_tokens: 1 },
    }),
  );
  const result = await budgetedFetch(
    scope,
    vi.fn(),
    network,
    "interactive",
  )(endpoint, {
    method: "POST",
    body: JSON.stringify({ model: "gpt-6-luna", input: "synthetic" }),
  });
  expect(result.status).toBe(200);
  expect(network).toHaveBeenCalledTimes(1);
});

it.each([
  ["incomplete", "attempt_incomplete"],
  ["failed", "attempt_failed"],
] as const)(
  "records %s as a distinct terminal without inventing usage",
  async (status, kind) => {
    const network = vi.fn<typeof fetch>(async () =>
      Response.json({ id: "response-edge", status, output: [] }),
    );
    const response = await budgetedFetch(
      scope,
      vi.fn(),
      network,
      "interactive",
    )(endpoint, {
      method: "POST",
      body: JSON.stringify({ model: "gpt-6-luna", input: "synthetic" }),
    });
    await response.text();
    const terminal = sink.mock.calls.find((c) => c[2][0].kind === kind);
    expect(terminal?.[2][0].usage).toBeNull();
    expect(network).toHaveBeenCalledTimes(1);
  },
);

it("captures a split SSE terminal while returning the original bytes", async () => {
  const wire =
    "event: response.completed\ndata: " +
    JSON.stringify({
      type: "response.completed",
      response: {
        id: "response-sse",
        status: "completed",
        output: [],
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    }) +
    "\n\n";
  const network = vi.fn<typeof fetch>(
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode(wire.slice(0, 19)));
            c.enqueue(new TextEncoder().encode(wire.slice(19)));
            c.close();
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
  );
  const response = await budgetedFetch(
    scope,
    vi.fn(),
    network,
    "interactive",
  )(endpoint, {
    method: "POST",
    body: JSON.stringify({
      model: "gpt-6-luna",
      input: "synthetic",
      stream: true,
    }),
  });
  expect(await response.text()).toBe(wire);
  const terminal = sink.mock.calls.find(
    (c) => c[2][0].kind === "attempt_completed",
  );
  expect(terminal?.[2][0].usage).toMatchObject({
    inputTokens: 0,
    outputTokens: 0,
  });
  expect(network).toHaveBeenCalledTimes(1);
});

it("marks explicit stream cancellation separately from absent terminal usage", async () => {
  const network = vi.fn<typeof fetch>(
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(
              new TextEncoder().encode('data: {"type":"response.created"}\n\n'),
            );
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
  );
  const response = await budgetedFetch(
    scope,
    vi.fn(),
    network,
    "interactive",
  )(endpoint, {
    method: "POST",
    body: JSON.stringify({
      model: "gpt-6-luna",
      input: "synthetic",
      stream: true,
    }),
  });
  await response.body?.cancel();
  const terminal = sink.mock.calls.find(
    (c) => c[2][0].kind === "attempt_cancelled",
  );
  expect(terminal?.[2][0]).toMatchObject({ status: "cancelled", usage: null });
  expect(network).toHaveBeenCalledTimes(1);
});
