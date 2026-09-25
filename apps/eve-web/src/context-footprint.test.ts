import { describe, expect, it } from "vitest";
import { contextFootprint } from "./context-footprint";

describe("actual provider context footprint", () => {
  it("measures payload/catalog/tool bytes without retaining content", () => {
    const body = {
      input: [{ type: "function_call_output", output: "secret-text" }],
      tools: [{ name: "resolve_place" }],
      instructions: "secret-system",
    };
    const result = contextFootprint(body);
    expect(result.payloadBytes).toBe(Buffer.byteLength(JSON.stringify(body)));
    expect(result.toolDefinitions).toBe(1);
    expect(result.toolOutputBytes).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("only reports duplicated structured content when text contains exactly the same JSON", () => {
    const structuredContent = { spaces: null, source: "Madrid" };
    const payload = (text: string) => ({
      input: [
        {
          type: "function_call_output",
          output: JSON.stringify({
            structuredContent,
            content: [{ type: "text", text }],
          }),
        },
      ],
    });
    expect(
      contextFootprint(payload(JSON.stringify(structuredContent)))
        .duplicatedStructuredResults,
    ).toBe(1);
    expect(
      contextFootprint(payload("Summary, not duplicated JSON"))
        .duplicatedStructuredResults,
    ).toBe(0);
  });
});
