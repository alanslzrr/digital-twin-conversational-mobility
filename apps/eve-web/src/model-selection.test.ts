import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import {
  controlSettings,
  modelProfileInput,
  type TurnBinding,
} from "@mobility/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  runtime: vi.fn(),
  model: vi.fn(),
  update: vi.fn(),
  get: vi.fn(),
}));
vi.mock("eve", () => ({
  defineAgent: (value: unknown) => value,
  defineDynamic: (value: unknown) => value,
}));
vi.mock("./control-client", () => ({ runtimeControl: mocked.runtime }));
vi.mock("./llm-state", () => ({
  llmBinding: { update: mocked.update, get: mocked.get },
}));
vi.mock("./model", () => ({ createEvaluationModel: mocked.model }));

import agent from "../agent/agent";

const id = "11111111-1111-4111-8111-111111111111";
const binding: TurnBinding = {
  id,
  principalId: id,
  sessionId: "session",
  turnId: "turn",
  providerId: id,
  providerName: "Fixture",
  credentialId: id,
  credentialVersion: 1,
  grantId: null,
  outputLimit: 128,
  policyVersion: 1,
  policy: controlSettings.parse({
    capacity: 30,
    globalConcurrency: 5,
    userConcurrency: 1,
    requestsPerMinute: 6,
    requestsPerDay: 60,
    inputTokensPerSession: 100000,
    outputTokensPerSession: 10000,
    outputTokensPerCall: 128,
  }),
  model: {
    ...modelProfileInput.parse({
      providerId: id,
      modelId: "fixture",
      name: "Fixture",
      protocol: "responses",
      contextTokens: 8192,
      maxOutputTokens: 1024,
      tools: true,
      streaming: true,
      ready: true,
    }),
    id,
    version: 1,
    enabled: true,
  },
};
const context = {
  session: {
    id: "session",
    auth: {
      current: {
        issuer: "mobility-evaluation",
        authenticator: "evaluator-password",
        principalType: "user",
        principalId: id,
        attributes: { mobaiSelectionId: id },
      },
    },
  },
  messages: [] as unknown[],
};
const definition = agent as unknown as {
  defaultTools: boolean;
  model: {
    events: Record<
      string,
      (event: unknown, context: unknown) => Promise<unknown>
    >;
  };
};
function start(ctx = context) {
  const resolve = definition.model.events["turn.started"];
  if (!resolve) throw new Error("turn resolver required");
  return resolve({ data: { turnId: "turn" } }, ctx);
}
beforeEach(() => {
  mocked.runtime.mockResolvedValue(binding);
  mocked.get.mockReturnValue(binding);
  mocked.model.mockReturnValue({ modelId: "fixture" });
});
describe("EVE turn-pinned model resolver", () => {
  it("rehydrates a live model before the pinned EVE manual-compaction branch resolves it", () => {
    const require = createRequire(import.meta.url);
    const source = readFileSync(
      resolve(dirname(require.resolve("eve")), "harness/tool-loop.js"),
      "utf8",
    );
    const branch = source.slice(source.indexOf("if(e.compactOnly===!0)"));
    expect(
      branch.indexOf("await e.dispatchDynamicModelEvent("),
    ).toBeGreaterThan(0);
    expect(branch.indexOf("await e.dispatchDynamicModelEvent(")).toBeLessThan(
      branch.indexOf("await resolveEffectiveRuntimeModel("),
    );
  });

  it("pins a serializable turn selection and rehydrates only that binding for live steps", async () => {
    expect(Object.keys(definition.model.events)).toEqual([
      "turn.started",
      "step.started",
    ]);
    expect(definition.defaultTools).toBe(false);
    expect(await start()).toMatchObject({
      model: "mobai/fixture",
      modelContextWindowTokens: 8192,
      modelOptions: { providerOptions: { openai: { store: false } } },
    });
    expect(mocked.runtime).toHaveBeenCalledWith({
      action: "turn.bind",
      principalId: id,
      sessionId: "session",
      turnId: "turn",
      selectionId: id,
    });
    expect(mocked.model).not.toHaveBeenCalled();
    const resolveStep = definition.model.events["step.started"];
    if (!resolveStep) throw new Error("live step resolver required");
    await resolveStep({ data: { turnId: "turn" } }, context);
    expect(mocked.model).toHaveBeenCalledWith(binding);
    expect(mocked.runtime).toHaveBeenCalledTimes(1);
  });
  it("releases a rejected smaller-context turn without replacing the previous compaction binding", async () => {
    await expect(
      start({
        ...context,
        messages: [{ role: "user", content: "x".repeat(8192) }],
      }),
    ).rejects.toThrow("context_exceeded");
    expect(mocked.runtime).toHaveBeenLastCalledWith({
      action: "turn.finish",
      principalId: id,
      sessionId: "session",
      turnId: "turn",
      status: "failed",
    });
    expect(mocked.update).not.toHaveBeenCalled();
    expect(mocked.model).not.toHaveBeenCalled();
  });
  it("does not accept untrusted caller attributes", async () => {
    await expect(
      start({
        ...context,
        session: {
          ...context.session,
          auth: {
            current: { ...context.session.auth.current, issuer: "browser" },
          },
        },
      }),
    ).rejects.toThrow("authentication_required");
    expect(mocked.runtime).not.toHaveBeenCalled();
  });
});
