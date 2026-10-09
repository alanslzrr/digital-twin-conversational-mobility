import type { LanguageModelMiddleware } from "ai";
import { describe, expect, it } from "vitest";
import { providerHistory } from "./model-history";

type TransformInput = Parameters<
  NonNullable<LanguageModelMiddleware["transformParams"]>
>[0];
const prompt: TransformInput["params"]["prompt"] = [
  {
    role: "assistant",
    content: [
      {
        type: "reasoning",
        text: "same-provider private reasoning",
        providerOptions: {
          mobai: { providerId: "old:chat-completions:model" },
          openai: { itemId: "opaque" },
        },
      },
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "mobility",
        input: "{}",
        providerOptions: {
          mobai: { providerId: "old:chat-completions:model" },
          openai: { itemId: "opaque" },
        },
      },
    ],
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "mobility",
        output: { type: "text", value: "observed evidence" },
        providerOptions: { openai: { itemId: "opaque-result" } },
      },
    ],
  },
];
async function transform(provider: string) {
  const middleware = providerHistory(provider);
  if (!middleware.transformParams) throw new Error("transform required");
  return middleware.transformParams({
    params: { prompt },
    type: "generate",
    model: {},
  } as TransformInput);
}
describe("model history boundary", () => {
  it("preserves same-model reasoning needed by tool continuation without mutating history", async () => {
    const saved = JSON.stringify(prompt);
    const result = await transform("old:chat-completions:model");
    expect(JSON.stringify(result)).toContain("same-provider private reasoning");
    expect(JSON.stringify(prompt)).toBe(saved);
  });
  it("drops foreign reasoning and opaque references but keeps tool-call/result pairs", async () => {
    const result = await transform("new:responses:other");
    expect(JSON.stringify(result)).not.toContain("opaque");
    expect(JSON.stringify(result)).not.toContain("private reasoning");
    expect(result.prompt).toMatchObject([
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "call-1" }],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            output: { value: "observed evidence" },
          },
        ],
      },
    ]);
  });
});
