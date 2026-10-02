import { describe, expect, it } from "vitest";
import { projectPayload } from "./telemetry-projection";

describe("effective wire capture", () => {
  it("captures effective input and tools without reasoning or opaque provider metadata", () => {
    const p = projectPayload(
      {
        instructions: "effective prompt",
        input: [
          { role: "user", content: "question" },
          { type: "reasoning", encrypted_content: "canary" },
        ],
        headers: { Authorization: "canary" },
        tools: [
          {
            type: "function",
            name: "get_source_health",
            description: "health",
            parameters: {
              type: "object",
              properties: { source: { type: "string" } },
            },
          },
        ],
      },
      "model_input",
    );
    expect(p.content.messages.map((m) => m.role)).toEqual([
      "developer",
      "user",
    ]);
    expect(p.content.functions[0]?.name).toBe("get_source_health");
    expect(JSON.stringify(p)).not.toContain("canary");
  });
  it("keeps exact call id while sanitizing result content", () => {
    const p = projectPayload(
      {
        input: [
          {
            type: "function_call_output",
            call_id: "call_123",
            output: JSON.stringify({
              status: "found",
              secret: "canary",
              rawReference: "private/key",
            }),
          },
        ],
      },
      "model_input",
    );
    expect(p.content.messages[0]?.parts[0]).toMatchObject({
      callId: "call_123",
      output: '{"status":"found"}',
    });
  });
  it("does not retain arbitrary tool result metadata", () => {
    expect(
      JSON.stringify(
        projectPayload(
          { arbitraryMetadata: "canary", status: "found" },
          "tool_output",
        ),
      ),
    ).not.toContain("canary");
  });
  it("bounds large projected input and preserves valid structure", () => {
    const p = projectPayload(
      {
        input: Array.from({ length: 100 }, () => ({
          role: "user",
          content: "a".repeat(12000),
        })),
      },
      "model_input",
    );
    expect(p.retainedBytes).toBeLessThanOrEqual(512000);
    expect(p.truncated).toBe(true);
  });
});

it("retains only fixed qualified tools and distinguishes discovery without widening MCP", () => {
  const p = projectPayload(
    {
      tools: [
        {
          type: "function",
          name: "mobility__get_network_status",
          parameters: {},
        },
        { type: "function", name: "connection_search", parameters: {} },
        { type: "function", name: "other__get_network_status", parameters: {} },
      ],
      input: [
        {
          type: "function_call",
          name: "mobility__get_network_status",
          call_id: "real_call",
          arguments: "{}",
        },
      ],
    },
    "model_input",
  );
  expect(p.content.functions.map((f) => f.name)).toEqual([
    "mobility__get_network_status",
    "connection_search",
  ]);
  expect(p.content.messages[0]?.parts[0]).toMatchObject({
    name: "mobility__get_network_status",
    callId: "real_call",
  });
});
