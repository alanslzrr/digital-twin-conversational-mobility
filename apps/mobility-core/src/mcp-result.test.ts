import { expect, it } from "vitest";
import { mcpResult } from "./mcp-result";

it("sends one lossless JSON representation through standard MCP text content", () => {
  const value = {
    status: "available",
    observedAt: "2026-09-25T09:18:07Z",
    stations: [{ bikes: 0, docks: null }],
    note: "datos antiguos",
  };
  const result = mcpResult(value);
  expect(result.content).toHaveLength(1);
  expect(result.content[0]?.type).toBe("text");
  expect(JSON.parse(result.content[0]?.text ?? "")).toEqual(value);
  expect(result).not.toHaveProperty("structuredContent");
  const old = { ...result, structuredContent: value };
  expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(
    Buffer.byteLength(JSON.stringify(old)),
  );
});
it("keeps unavailable results explicit rather than inventing an empty snapshot", () => {
  expect(
    JSON.parse(
      mcpResult({
        status: "unavailable",
        reason: "mobility_backend_unavailable",
      }).content[0]?.text ?? "",
    ),
  ).toEqual({ status: "unavailable", reason: "mobility_backend_unavailable" });
});
