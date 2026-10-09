import { modelProfileInput, type TurnBinding } from "@mobility/contracts";
import { beforeEach, expect, it, vi } from "vitest";

const sink = vi.hoisted(() => vi.fn());
vi.mock("./telemetry", async (original) => ({
  ...(await original<typeof import("./telemetry")>()),
  sendTelemetry: sink,
}));

import { observeModelResponse } from "./model-telemetry";

const id = "11111111-1111-4111-8111-111111111111";
const scope = {
  principalId: id,
  sessionId: "s",
  turnId: "t",
  purpose: "step" as const,
  stepIndex: 0,
};
function binding(protocol: "responses" | "chat-completions"): TurnBinding {
  return {
    id,
    ...scope,
    providerId: id,
    providerName: "Fixture",
    credentialId: id,
    credentialVersion: 1,
    grantId: null,
    outputLimit: 128,
    policyVersion: 1,
    policy: {
      capacity: 30,
      globalConcurrency: 5,
      userConcurrency: 1,
      requestsPerMinute: 6,
      requestsPerDay: 60,
      inputTokensPerSession: 100000,
      outputTokensPerSession: 10000,
      outputTokensPerCall: 128,
    },
    model: {
      ...modelProfileInput.parse({
        providerId: id,
        modelId: "fixture",
        name: "Fixture",
        protocol,
        contextTokens: 8192,
        maxOutputTokens: 1024,
        tools: true,
        streaming: true,
      }),
      id,
      version: 1,
      enabled: true,
    },
  };
}
beforeEach(() => {
  sink.mockReset();
  sink.mockResolvedValue(undefined);
});
it.each(["responses", "chat-completions"] as const)(
  "captures %s tool pairs, usage and safe output without reasoning",
  async (protocol) => {
    const request =
      protocol === "responses"
        ? {
            input: [
              {
                type: "function_call_output",
                call_id: "call_exact",
                output: "{}",
              },
            ],
          }
        : {
            messages: [
              { role: "tool", tool_call_id: "call_exact", content: "{}" },
            ],
          };
    const output =
      protocol === "responses"
        ? {
            id: "response1",
            status: "completed",
            output: [
              { role: "assistant", content: "answer" },
              { type: "reasoning", encrypted_content: "canary" },
            ],
            usage: { input_tokens: 10, output_tokens: 4 },
          }
        : {
            id: "response1",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "answer",
                  reasoning_content: "canary",
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 4 },
          };
    const result = await observeModelResponse(
      binding(protocol),
      scope,
      request,
      Response.json(output, { headers: { "x-mobai-attempt": id } }),
      performance.now(),
    );
    expect(result.ok).toBe(true);
    expect(
      sink.mock.calls.find((c) => c[2][0].kind === "attempt_completed")?.[2][0],
    ).toMatchObject({
      sentCallIds: ["call_exact"],
      usage: { inputTokens: 10, outputTokens: 4 },
      providerResponseId: "response1",
    });
    expect(JSON.stringify(sink.mock.calls)).not.toContain("canary");
  },
);
it("projection failure cannot repeat or fail an inference", async () => {
  sink.mockRejectedValue(new Error("observer offline"));
  const original = Response.json(
    { output: [] },
    { headers: { "x-mobai-attempt": id } },
  );
  expect(
    await observeModelResponse(
      binding("responses"),
      scope,
      { input: [] },
      original,
      performance.now(),
    ),
  ).toBe(original);
});
it.each(["responses", "chat-completions"] as const)(
  "observes split %s SSE while preserving wire bytes",
  async (protocol) => {
    const event =
      protocol === "responses"
        ? {
            type: "response.completed",
            response: {
              id: "r",
              output: [],
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          }
        : {
            id: "r",
            choices: [{ delta: { content: "answer" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 0, completion_tokens: 0 },
          };
    const wire = `data: ${JSON.stringify(event)}\n\n${protocol === "chat-completions" ? "data: [DONE]\n\n" : ""}`;
    const response = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(wire.slice(0, 19)));
          c.enqueue(new TextEncoder().encode(wire.slice(19)));
          c.close();
        },
      }),
      {
        headers: { "content-type": "text/event-stream", "x-mobai-attempt": id },
      },
    );
    expect(
      await (
        await observeModelResponse(
          binding(protocol),
          scope,
          {},
          response,
          performance.now(),
        )
      ).text(),
    ).toBe(wire);
    expect(
      sink.mock.calls.find((c) => c[2][0].kind === "attempt_completed")?.[2][0]
        .usage,
    ).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  },
);
it("records explicit cancellation without inventing usage", async () => {
  const response = new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(
          new TextEncoder().encode('data: {"type":"response.created"}\n\n'),
        );
      },
    }),
    { headers: { "content-type": "text/event-stream", "x-mobai-attempt": id } },
  );
  await (
    await observeModelResponse(
      binding("responses"),
      scope,
      {},
      response,
      performance.now(),
    )
  ).body?.cancel();
  expect(
    sink.mock.calls.find((c) => c[2][0].kind === "attempt_cancelled")?.[2][0]
      .usage,
  ).toBeNull();
});

it("does not publish interim chat usage as a final reading after interruption", async () => {
  const response = new Response(
    'data: {"id":"partial","choices":[{"delta":{"content":"partial"}}],"usage":{"prompt_tokens":20,"completion_tokens":3}}\n\n',
    { headers: { "content-type": "text/event-stream", "x-mobai-attempt": id } },
  );
  await (
    await observeModelResponse(
      binding("chat-completions"),
      scope,
      {},
      response,
      performance.now(),
    )
  ).text();
  expect(sink.mock.calls.at(-1)?.[2][0]).toMatchObject({
    status: "unknown",
    usage: null,
  });
});
