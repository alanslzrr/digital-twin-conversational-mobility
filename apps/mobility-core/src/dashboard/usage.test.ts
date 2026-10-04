import { expect, it } from "vitest";
import { attemptUsage } from "./usage";

it("does not fabricate zero for empty or missing usage", () => {
  expect(attemptUsage([])).toMatchObject({
    inputTokens: null,
    outputTokens: null,
    cachedInputTokens: null,
    reasoningTokens: null,
    totalTokens: null,
  });
  expect(
    attemptUsage([{ input_tokens: null, output_tokens: null }]).coverage.input,
  ).toMatchObject({ reported: 0, observed: 1, partial: true });
});
it("preserves explicit zero and independent partial denominators", () => {
  const result = attemptUsage([
    { input_tokens: 0, output_tokens: 0 },
    { input_tokens: null, output_tokens: 7 },
  ]);
  expect(result).toMatchObject({
    inputTokens: 0,
    outputTokens: 7,
    totalTokens: 0,
    reasoningTokens: null,
    coverage: {
      input: { reported: 1, observed: 2 },
      output: { reported: 2, observed: 2 },
    },
  });
});
