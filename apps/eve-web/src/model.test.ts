import { afterEach, describe, expect, it, vi } from "vitest";
import { createEvaluationModel, MODEL_ID } from "./model";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("direct OpenAI model", () => {
  it("fails closed when the API key is missing", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => createEvaluationModel()).toThrow("OPENAI_API_KEY is required");
  });

  it("pins Luna Responses without Gateway or model overrides", () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-not-a-real-key");
    vi.stubEnv("EVE_MODEL", "another-provider/another-model");
    const model = createEvaluationModel();
    expect(MODEL_ID).toBe("gpt-6-luna");
    expect(model.modelId).toBe("gpt-6-luna");
    expect(model.provider).toBe("openai.responses");
  });
  it("sends the configured key only to the native Responses endpoint", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-not-a-real-key");
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { message: "test rejection", type: "invalid_request_error" },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createEvaluationModel().doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
        maxOutputTokens: 16,
        providerOptions: { openai: { store: false } },
      }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(String(url)).toBe("https://api.openai.com/v1/responses");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer test-only-not-a-real-key",
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "gpt-6-luna",
      store: false,
    });
  });
});
