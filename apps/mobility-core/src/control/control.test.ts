import { randomBytes } from "node:crypto";
import { modelProfileInput } from "@mobility/contracts";
import { reservationCost, usageCost, verifiedPrices } from "@mobility/domain";
import { describe, expect, it, vi } from "vitest";
import { ControlError, controlError, externallyEnabled } from "./errors";
import { requireAdmin } from "./identity";
import { providerUrl, publicAddress, resolveProvider } from "./network";
import { seal, unseal } from "./secrets";
import {
  normalizeProviderError,
  parseProviderUsage,
  prepareProviderBody,
  safeProviderValue,
  UsageObserver,
} from "./usage";

const id = "11111111-1111-4111-8111-111111111111";
const profile = (protocol: "responses" | "chat-completions" = "responses") => ({
  ...modelProfileInput.parse({
    providerId: id,
    modelId: "fixture",
    name: "Fixture",
    protocol,
    contextTokens: 8192,
    maxOutputTokens: 512,
    tools: true,
    streaming: true,
    ready: true,
    inputMicrosPerMillion: 1_000_000,
    outputMicrosPerMillion: 2_000_000,
    cacheMicrosPerMillion: 500_000,
    pricesValidUntil: "2099-01-01T00:00:00Z",
  }),
  id,
  enabled: true,
  version: 1,
});
describe("encrypted Core secrets", () => {
  it("uses randomized authenticated encryption with purpose binding", () => {
    const key = randomBytes(32),
      value = "synthetic-credential";
    const a = seal(value, "key:1", key),
      b = seal(value, "key:1", key);
    expect(a).not.toBe(b);
    expect(a).not.toContain(value);
    expect(unseal(a, "key:1", key)).toBe(value);
    expect(() => unseal(a, "key:2", key)).toThrow();
    expect(() => unseal(a, "key:1", randomBytes(32))).toThrow();
    expect(() =>
      unseal(`${a.slice(0, 30)}a${a.slice(31)}`, "key:1", key),
    ).toThrow();
  });
  it("never serializes exception details", async () => {
    const response = controlError(new Error("synthetic-secret"));
    expect(await response.text()).not.toContain("synthetic-secret");
    expect(response.status).toBe(503);
  });
});
describe("SSRF protection", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "100.100.100.200",
    "0.0.0.0",
    "224.1.1.1",
    "192.168.1.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])("rejects non-public %s", (ip) => expect(publicAddress(ip)).toBe(false));
  it.each([
    "http://api.example.com",
    "https://user:password@api.example.com",
    "https://localhost",
    "https://127.1/v1",
    "https://2130706433/v1",
    "https://api.example.com./v1",
    "https://api.example.com/v1?key=x",
    "https://api.example.com/#fragment",
  ])("rejects unsafe URL %s", (url) =>
    expect(() => providerUrl(url)).toThrow(),
  );
  it("rejects mixed DNS answers and rebinding on a subsequent resolution", async () => {
    const resolver = vi
      .fn()
      .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValueOnce([
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]);
    expect(
      (await resolveProvider("https://api.example.com/v1", resolver)).addresses,
    ).toHaveLength(1);
    await expect(
      resolveProvider("https://api.example.com/v1", resolver),
    ).rejects.toThrow("invalid_request");
  });
});
describe("provider neutral usage and wire validation", () => {
  it.each(["responses", "chat-completions"] as const)(
    "distinguishes absent, malformed and zero usage for %s",
    (protocol) => {
      expect(parseProviderUsage({}, protocol)).toBeNull();
      const usage =
        protocol === "responses"
          ? { input_tokens: 0, output_tokens: 0 }
          : { prompt_tokens: 0, completion_tokens: 0 };
      expect(parseProviderUsage(usage, protocol)).toMatchObject({
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: null,
        reasoningTokens: null,
      });
      expect(
        parseProviderUsage({ ...usage, cost: -1 }, protocol)
          ?.reportedCostMicros,
      ).toBeNull();
    },
  );
  it("does not double count cached input or reasoning included in output", () => {
    const usage = parseProviderUsage(
      {
        input_tokens: 100,
        output_tokens: 10,
        input_tokens_details: { cached_tokens: 20 },
        output_tokens_details: { reasoning_tokens: 4 },
      },
      "responses",
    );
    if (!usage) throw new Error("Expected valid synthetic usage");
    expect(usageCost(profile(), usage)).toBe(110);
    expect(reservationCost(profile(), 512)).toBe(9216);
    expect(verifiedPrices(profile())).toBe(true);
    expect(verifiedPrices({ ...profile(), pricesValidUntil: null })).toBe(
      false,
    );
    expect(
      parseProviderUsage(
        {
          prompt_tokens: 10,
          completion_tokens: 2,
          prompt_tokens_details: { cached_tokens: 11 },
        },
        "chat-completions",
      ),
    ).toBeNull();
  });
  it("accepts EVE's hashed safety identifier but rejects arbitrary metadata", () => {
    const request = {
      model: "fixture",
      input: [],
      safety_identifier: "a".repeat(64),
    };
    expect(
      prepareProviderBody(request, profile("responses"), 128).safety_identifier,
    ).toBe("a".repeat(64));
    expect(() =>
      prepareProviderBody(
        { ...request, safety_identifier: { user: "secret" } },
        profile("responses"),
        128,
      ),
    ).toThrow("model_incompatible");
    expect(() =>
      prepareProviderBody(
        { ...request, metadata: { arbitrary: true } },
        profile("responses"),
        128,
      ),
    ).toThrow("model_incompatible");
  });
  it.each(["responses", "chat-completions"] as const)(
    "bounds %s output, preserves tool results and rejects context overflow",
    (protocol) => {
      const key = protocol === "responses" ? "input" : "messages";
      const body = prepareProviderBody(
        { model: "fixture", [key]: [{ role: "user", content: "hello" }] },
        profile(protocol),
        128,
      );
      expect(body.stream).toBe(false);
      expect(
        body[protocol === "responses" ? "max_output_tokens" : "max_tokens"],
      ).toBe(128);
      expect(() =>
        prepareProviderBody(
          { ...body, previous_response_id: "opaque" },
          profile(protocol),
          128,
        ),
      ).toThrow();
      expect(() =>
        prepareProviderBody(
          {
            model: "fixture",
            [key]: [{ role: "user", content: "a".repeat(9000) }],
          },
          profile(protocol),
          128,
        ),
      ).toThrow("context_exceeded");
      expect(() =>
        prepareProviderBody(
          { ...body, tools: [{ type: "web_search" }] },
          profile(protocol),
          128,
        ),
      ).toThrow();
    },
  );
  it.each(["responses", "chat-completions"] as const)(
    "frames split UTF-8 SSE for %s and retains only valid final usage",
    (protocol) => {
      const event =
        protocol === "responses"
          ? {
              type: "response.completed",
              response: {
                id: "r",
                usage: { input_tokens: 2, output_tokens: 1 },
                output: [{ text: "á" }],
              },
            }
          : {
              id: "r",
              choices: [{ delta: { content: "á" }, finish_reason: "stop" }],
              usage: { prompt_tokens: 2, completion_tokens: 1 },
            };
      const bytes = new TextEncoder().encode(
        `data: ${JSON.stringify(event)}\r\n\r\n${protocol === "chat-completions" ? "data: [DONE]\r\n\r\n" : ""}`,
      );
      const observer = new UsageObserver(protocol);
      const out = [];
      for (const byte of bytes) out.push(observer.feed(new Uint8Array([byte])));
      out.push(observer.feed(new Uint8Array(), true));
      expect(observer.usage).toMatchObject({ inputTokens: 2, outputTokens: 1 });
      expect(observer.terminal).toBe(true);
      expect(Buffer.concat(out).toString()).toContain("á");
    },
  );
  it("never treats interim usage as final usage or persists a credential echoed as an ID", () => {
    const response = new UsageObserver("responses");
    response.feed(
      new TextEncoder().encode(
        'data: {"type":"response.in_progress","response":{"usage":{"input_tokens":1,"output_tokens":0}}}\n\ndata: {"type":"response.completed","response":{}}\n\n',
      ),
    );
    expect(response.usage).toBeNull();
    const chat = new UsageObserver("chat-completions");
    chat.feed(
      new TextEncoder().encode(
        'data: {"choices":[{"delta":{"content":"x"}}],"usage":{"prompt_tokens":1,"completion_tokens":0}}\n\ndata: [DONE]\n\n',
      ),
    );
    expect(chat.usage).toBeNull();
    const leak = new UsageObserver("responses", "synthetic-secret");
    expect(() =>
      leak.feed(
        new TextEncoder().encode(
          'data: {"type":"response.created","response":{"id":"synthetic-secret"}}\n\n',
        ),
      ),
    ).toThrow();
    expect(leak.responseId).toBeNull();
  });
  it("leaves interrupted streams uncertain and sanitizes in-stream error details", () => {
    const observer = new UsageObserver("responses", "synthetic-secret");
    const wire = observer.feed(
      new TextEncoder().encode(
        'data: {"type":"error","message":"synthetic-secret"}\n\n',
      ),
    );
    expect(new TextDecoder().decode(wire)).not.toContain("synthetic-secret");
    expect(observer.terminal).toBe(false);
    expect(observer.usage).toBeNull();
    expect(() =>
      safeProviderValue(
        { output: [{ text: "synthetic-secret" }] },
        "synthetic-secret",
      ),
    ).toThrow();
  });
  it.each([
    [401, "credential_invalid"],
    [402, "provider_balance"],
    [403, "model_denied"],
    [429, "rate_limited"],
    [503, "provider_unavailable"],
  ] as const)("maps HTTP %s without reflecting upstream data", (status, code) =>
    expect(
      normalizeProviderError(status, { error: { message: "do not expose" } })
        .code,
    ).toBe(code),
  );
});
it("previews deny external effects even when explicitly enabled", () => {
  expect(
    externallyEnabled("LLM", {
      MOBAI_LLM_ENABLED: "true",
      DEPLOYMENT_ENV: "preview",
    }),
  ).toBe(false);
  expect(
    externallyEnabled("EMAIL", {
      MOBAI_EMAIL_ENABLED: "true",
      VERCEL_ENV: "preview",
    }),
  ).toBe(false);
  expect(externallyEnabled("LLM", {})).toBe(false);
});
it("admin role, session MFA and recent step-up are independent requirements", () => {
  const identity = {
    id,
    authId: id,
    sessionId: id,
    email: "test@example.test",
    label: "Test",
    role: "admin" as const,
    mfa: true,
    reauthenticated: true,
  };
  expect(() => requireAdmin(identity)).not.toThrow();
  expect(() => requireAdmin({ ...identity, role: "evaluator" })).toThrow(
    "access_denied",
  );
  expect(() => requireAdmin({ ...identity, mfa: false })).toThrow(
    "mfa_required",
  );
  expect(() => requireAdmin({ ...identity, reauthenticated: false })).toThrow(
    "reauth_required",
  );
  expect(() =>
    requireAdmin({ ...identity, reauthenticated: false }, false),
  ).not.toThrow();
  expect(
    controlError(new ControlError("rate_limited", 429, 60)).headers.get(
      "retry-after",
    ),
  ).toBe("60");
});
