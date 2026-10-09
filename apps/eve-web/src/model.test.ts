import { modelProfileInput, type TurnBinding } from "@mobility/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { coreModelFetch, createEvaluationModel } from "./model";

const id = "11111111-1111-4111-8111-111111111111";
const context = {
  principalId: id,
  sessionId: "s",
  turnId: "t",
  stepIndex: 0,
  purpose: "step",
};
vi.mock("./budget-context", () => ({ currentBudgetContext: () => context }));
const binding = (protocol: "responses" | "chat-completions"): TurnBinding => ({
  id,
  principalId: id,
  sessionId: "s",
  turnId: "t",
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
      modelId: "fixture-model",
      name: "Fixture",
      protocol,
      contextTokens: 8192,
      maxOutputTokens: 1024,
      tools: true,
      streaming: true,
      ready: true,
    }),
    id,
    enabled: true,
    version: 1,
  },
});
function setup() {
  vi.stubEnv("MOBILITY_MCP_URL", "http://127.0.0.1:3001/mcp");
  vi.stubEnv("MOBILITY_MCP_TOKEN", "synthetic-internal-token");
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("Core-only multiprovider model", () => {
  it.each(["responses", "chat-completions"] as const)(
    "uses a concrete %s SDK, the pinned model and only the service credential",
    async (protocol) => {
      setup();
      const network = vi.fn(async () =>
        Response.json({ error: "credential_invalid" }, { status: 400 }),
      );
      const model = createEvaluationModel(binding(protocol), network);
      expect(model.modelId).toBe("fixture-model");
      await expect(
        model.doGenerate({
          prompt: [
            { role: "user", content: [{ type: "text", text: "hello" }] },
          ],
          maxOutputTokens: 16,
        }),
      ).rejects.toMatchObject({
        message: "credential_invalid",
        isRetryable: false,
        requestBodyValues: {},
      });
      expect(network).toHaveBeenCalledTimes(1);
      const [url, init] = network.mock.calls[0] as unknown as [
        URL,
        RequestInit,
      ];
      expect(String(url)).toBe(
        `http://127.0.0.1:3001/internal/llm/v1/${protocol === "responses" ? "responses" : "chat/completions"}`,
      );
      expect(new Headers(init.headers).get("authorization")).toBe(
        "Bearer synthetic-internal-token",
      );
      expect(JSON.parse(String(init.body)).model).toBe("fixture-model");
      expect(new Headers(init.headers).get("x-mobai-binding")).toBe(id);
      expect(init.redirect).toBe("error");
    },
  );
  it("does not accept another destination or owner", async () => {
    setup();
    const network = vi.fn();
    const transport = coreModelFetch(binding("responses"), network);
    await expect(
      transport("https://unapproved.example/responses", {
        method: "POST",
        body: "{}",
      }),
    ).rejects.toThrow("model_incompatible");
    await expect(
      coreModelFetch(
        { ...binding("responses"), principalId: "someone-else" },
        network,
      )("http://127.0.0.1:3001/internal/llm/v1/responses", {
        method: "POST",
        body: "{}",
      }),
    ).rejects.toThrow("access_denied");
    expect(network).not.toHaveBeenCalled();
  });
  it("does not silently bypass an invalid campaign mode", async () => {
    setup();
    vi.stubEnv("MOBILITY_BUDGET_MODE", "campain");
    await expect(
      createEvaluationModel(binding("responses"), vi.fn()).doGenerate({
        prompt: [],
      }),
    ).rejects.toThrow("Invalid MOBILITY_BUDGET_MODE");
  });
  it("forwards only safe errors, never Core or provider bodies", async () => {
    setup();
    const model = createEvaluationModel(binding("responses"), async () =>
      Response.json(
        { error: "unknown failure with sensitive details" },
        { status: 503 },
      ),
    );
    await expect(model.doGenerate({ prompt: [] })).rejects.toMatchObject({
      message: "provider_unavailable",
      isRetryable: false,
      requestBodyValues: {},
    });
  });
});
