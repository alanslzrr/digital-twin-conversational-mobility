import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { event } from "./telemetry";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it("shares bounded coordination across separately bundled EVE entries", async () => {
  vi.stubEnv("MOBAI_OTEL_ENABLED", "true");
  vi.useFakeTimers();
  const hooks = await import("./otel-coordination");
  vi.resetModules();
  const instrumentation = await import("./otel-coordination");
  expect(hooks).not.toBe(instrumentation);
  const session = randomUUID();
  const target = { kind: "turn" as const, turnId: "turn" };
  const listener = vi.fn();
  const unsubscribe = instrumentation.onTerminalReady(listener);
  try {
    hooks.registerTracePrincipal("owner", session);
    hooks.acknowledgeTerminals(
      session,
      [
        event({
          eventKey: "terminal",
          kind: "turn_completed",
          status: "succeeded",
          turnId: "turn",
        }),
      ],
      ["terminal"],
    );
    expect(instrumentation.telemetryPrincipal(session)).toBe("owner");
    expect(instrumentation.terminalReady(session, target)).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(30 * 60_000 + 1);
    expect(instrumentation.telemetryPrincipal(session)).toBeUndefined();
    expect(instrumentation.terminalReady(session, target)).toBe(false);
  } finally {
    unsubscribe();
  }
});

it("does not register owners while disabled or in preview", async () => {
  const registry = await import("./otel-coordination");
  for (const flag of ["false", "true"]) {
    const session = randomUUID();
    vi.stubEnv("MOBAI_OTEL_ENABLED", flag);
    vi.stubEnv("DEPLOYMENT_ENV", "preview");
    registry.registerTracePrincipal("owner", session);
    expect(registry.telemetryPrincipal(session)).toBeUndefined();
  }
});

it("caps the owner registry at 100 sessions without retaining payloads", async () => {
  vi.stubEnv("MOBAI_OTEL_ENABLED", "true");
  const registry = await import("./otel-coordination");
  const prefix = randomUUID();
  for (let i = 0; i <= 100; i++)
    registry.registerTracePrincipal("owner", `${prefix}:${i}`);
  expect(registry.telemetryPrincipal(`${prefix}:0`)).toBeUndefined();
  expect(registry.telemetryPrincipal(`${prefix}:100`)).toBe("owner");
});
