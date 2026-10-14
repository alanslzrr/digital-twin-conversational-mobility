import { isInstrumentationDisabled } from "eve/instrumentation";
import { afterEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ scope: vi.fn() }));
vi.mock("./budget-context", () => ({ currentBudgetContext: fixture.scope }));

import runs from "../agent/instrumentation/agent-runs";
import core from "../agent/instrumentation/core";
import local from "../agent/instrumentation/local";
import settings from "../agent/instrumentation/otel";

afterEach(() => {
  vi.unstubAllEnvs();
});
it("keeps both managed destinations disabled and metadata-only in every audience/environment", async () => {
  expect(isInstrumentationDisabled(local)).toBe(true);
  expect(isInstrumentationDisabled(runs)).toBe(true);
  for (const flag of ["false", "true"])
    for (const environment of [
      "development",
      "production",
      "preview",
    ] as const) {
      vi.stubEnv("MOBAI_OTEL_ENABLED", flag);
      vi.stubEnv("VERCEL_ENV", environment);
      for (const audience of ["private", "public"] as const) {
        expect(
          settings.options.tracePolicy?.({ environment, audience } as never),
        ).toEqual({
          emit: flag === "true" && environment !== "preview",
          recordInputs: false,
          recordOutputs: false,
        });
      }
    }
  await Promise.all(
    core.spanProcessors.map((p) =>
      typeof p === "string" ? undefined : p.shutdown(),
    ),
  );
});
it("uses only authenticated current coordinates, not model input or stale step state", () => {
  vi.stubEnv("MOBAI_OTEL_ENABLED", "true");
  const scope = {
    principalId: "owner",
    sessionId: "session",
    turnId: "turn",
    stepIndex: 3,
    purpose: "step",
  };
  fixture.scope.mockReturnValue(scope);
  const input = {
    session: {
      id: "session",
      auth: {
        current: {
          issuer: "mobility-evaluation",
          authenticator: "evaluator-password",
          principalType: "user",
          principalId: "owner",
        },
      },
    },
    turn: { id: "turn" },
    step: { index: 3 },
    modelInput: { instructions: "private", messages: ["private"] },
  };
  expect(core.runtimeContext?.(input as never)).toEqual({
    "mobai.turn_id": "turn",
    "mobai.step_index": 3,
    "mobai.purpose": "step",
  });
  fixture.scope.mockReturnValue({ ...scope, principalId: "other" });
  expect(core.runtimeContext?.(input as never)).toBeUndefined();
  fixture.scope.mockReturnValue({ ...scope, stepIndex: 2 });
  expect(core.runtimeContext?.(input as never)).toBeUndefined();
  fixture.scope.mockReturnValue({ ...scope, purpose: "compaction" });
  expect(core.runtimeContext?.(input as never)?.["mobai.purpose"]).toBe(
    "compaction",
  );
  vi.stubEnv("MOBAI_OTEL_ENABLED", "false");
  expect(core.runtimeContext?.(input as never)).toBeUndefined();
});
