import { dashboardToolCatalog, dashboardToolName } from "@mobility/contracts";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  read: vi.fn(),
  aggregate: vi.fn(),
}));
vi.mock("./ingestion", () => ({ activate: mocks.activate }));
vi.mock("./mobility", () =>
  Object.fromEntries(
    [
      "bikes",
      "departures",
      "environment",
      "incidents",
      "parking",
      "resolvePlace",
      "roads",
      "sourceHealth",
    ].map((name) => [name, mocks.read]),
  ),
);
vi.mock("./aggregates", () => ({
  lineStatus: mocks.aggregate,
  networkStatus: mocks.aggregate,
  mobilitySnapshot: mocks.aggregate,
}));
vi.mock("./crtm", () => ({ crtmTimetable: mocks.read }));
vi.mock("./emt-arrivals", () => ({ emtArrivals: mocks.read }));
vi.mock("./geocoding", () => ({ resolveAddress: mocks.read }));
vi.mock("./history", () => ({ historicalQuery: mocks.read }));
vi.mock("./routing", () => ({ planJourney: mocks.read }));

import {
  findMobilityTool,
  mobilityToolCatalog,
  mobilityTools,
  registerMobilityTools,
} from "./tool-registry";

beforeEach(() => {
  mocks.activate.mockReset().mockResolvedValue(undefined);
  mocks.read.mockReset().mockResolvedValue({ status: "available" });
  mocks.aggregate.mockReset().mockResolvedValue({ status: "partial_coverage" });
});
it("registers exactly the sixteen shared tools with their original schemas and annotations", () => {
  const registerTool = vi.fn();
  registerMobilityTools({ registerTool } as unknown as Parameters<
    typeof registerMobilityTools
  >[0]);
  expect(registerTool).toHaveBeenCalledTimes(16);
  expect(mobilityTools.map((tool) => tool.name).sort()).toEqual(
    [...dashboardToolName.options].sort(),
  );
  for (const [name, config] of registerTool.mock.calls) {
    expect(config).toEqual(findMobilityTool(name)?.config);
    expect(config.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(config.inputSchema).toBeDefined();
  }
  expect(findMobilityTool("unimplemented")).toBeUndefined();
});
it("preserves source filtering and excludes activation for stored aggregates", async () => {
  for (const name of ["get_network_status", "get_mobility_snapshot"]) {
    const result = await findMobilityTool(name)?.execute({ source: "renfe" });
    expect(mocks.aggregate).toHaveBeenLastCalledWith("renfe");
    expect(result).toEqual({
      content: [{ type: "text", text: '{"status":"partial_coverage"}' }],
    });
  }
  await findMobilityTool("get_line_status")?.execute({
    source: "renfe",
    line: "C-5",
  });
  expect(mocks.aggregate).toHaveBeenLastCalledWith({
    source: "renfe",
    line: "C-5",
    limit: 5,
  });
  expect(mocks.activate).not.toHaveBeenCalled();
});
it("preserves default validation, activation and consent arguments", async () => {
  await findMobilityTool("resolve_place")?.execute({ query: "Sol" });
  expect(mocks.activate).toHaveBeenCalledOnce();
  expect(mocks.read).toHaveBeenLastCalledWith("Sol", 5, undefined, undefined);
  await findMobilityTool("resolve_address")?.execute({
    query: "Puerta del Sol",
  });
  expect(mocks.read).toHaveBeenLastCalledWith("Puerta del Sol", false);
  await expect(
    findMobilityTool("resolve_place")?.execute({ query: "" }),
  ).rejects.toThrow();
  expect(mocks.activate).toHaveBeenCalledTimes(2);
});
it("keeps backend failure as sanitized MCP isError without exposing error text", async () => {
  mocks.read.mockRejectedValue(new Error("private canary"));
  const result = await findMobilityTool("get_source_health")?.execute({});
  expect(result).toEqual({
    content: [
      {
        type: "text",
        text: '{"status":"unavailable","reason":"mobility_backend_unavailable"}',
      },
    ],
    isError: true,
  });
});

it("derives a closed catalog and warns about effects independently of MCP readOnlyHint", () => {
  const tools = mobilityToolCatalog();
  expect(
    dashboardToolCatalog.parse({
      schemaVersion: 1,
      readAt: new Date().toISOString(),
      tools,
    }).tools,
  ).toHaveLength(16);
  expect(
    tools.find((tool) => tool.name === "get_network_status")?.possibleEffects,
  ).toEqual([]);
  expect(
    tools.find((tool) => tool.name === "resolve_place")?.possibleEffects,
  ).toEqual(["activate_window"]);
  expect(tools.find((tool) => tool.name === "plan_journey")).toMatchObject({
    storedAvailability: "not_materialized",
    possibleEffects: [
      "activate_window",
      "acquire_provider",
      "demand_weather",
      "write_cache",
      "calculate_otp",
    ],
  });
  expect(
    JSON.parse(
      tools.find((tool) => tool.name === "resolve_address")?.inputSchemaJson ??
        "{}",
    ).properties.allowExternal.default,
  ).toBe(false);
});
