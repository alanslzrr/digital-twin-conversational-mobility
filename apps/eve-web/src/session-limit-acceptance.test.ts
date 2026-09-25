import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

// Contract test against installed EVE 0.65.0, not a reimplementation of its decision logic.
// Private modules are used ONLY by this offline compatibility test.
const root = dirname(createRequire(import.meta.url).resolve("eve"));
const native = (file: string) =>
  import(/* @vite-ignore */ pathToFileURL(join(root, "harness", file)).href);
const policy = await native("session-limit-enforcement.js");
const continuation = await native("session-limit-continuation.js");
const usageState = await native("turn-tag-state.js");
const cancellation = await native("turn-cancellation.js");

function fixture(kind: "input" | "output") {
  const history = [
    {
      role: "user",
      kind: "user",
      content: "Atocha a Colón mañana; sin escaleras. Plazas desconocidas.",
    },
  ];
  const session = usageState.setTurnUsageState(
    {
      sessionId: "offline-session",
      continuationToken: "offline",
      history,
      state: {},
      limits: {
        maxInputTokensPerSession: 100_000,
        maxOutputTokensPerSession: 10_000,
      },
    },
    usageState.accumulateTurnUsage({
      turnId: "offline-turn",
      usage: {
        inputTokens: kind === "input" ? 100_000 : 1,
        outputTokens: kind === "output" ? 10_000 : 1,
      },
    }),
  );
  return {
    config: { mode: "conversation" },
    session,
    messages: history,
    emissionState: { sequence: 1, stepIndex: 0, turnId: "offline-turn" },
    emit: vi.fn(async (_event: unknown) => {}),
  };
}

describe("native EVE session-limit acceptance without provider traffic", () => {
  it.each(["input", "output"] as const)(
    "parks at the %s threshold, displays choices, and resumes only on approve",
    async (kind) => {
      const input = fixture(kind);
      const parked = await policy.enforceSessionUsageLimit(input);
      expect(parked.next).toBeNull();
      const events = input.emit.mock.calls.map(([event]) => event) as {
        type: string;
        data: {
          requests: {
            kind: string;
            prompt: string;
            requestId: string;
            options: { id: string }[];
          }[];
        };
      }[];
      const request = events.find((event) => event.type === "input.requested")
        ?.data.requests[0];
      if (!request) throw new Error("EVE did not emit a continuation prompt");
      expect(request.kind).toBe("session-limit");
      expect(
        request.options.map((option: { id: string }) => option.id),
      ).toEqual(["continue", "stop"]);
      expect(request.prompt).toContain(kind);
      expect(
        continuation.resolveSessionLimitContinuation({
          requests: [request],
          responses: [],
        }),
      ).toBeUndefined();
      expect(
        continuation.resolveSessionLimitContinuation({
          requests: [request],
          responses: [{ requestId: "not-this-request", optionId: "continue" }],
        }),
      ).toBeUndefined();
      const approval = continuation.resolveSessionLimitContinuation({
        requests: [request],
        responses: [{ requestId: request.requestId, optionId: "continue" }],
      });
      const resumed = await policy.applySessionLimitContinuation({
        ...input,
        session: parked.session,
        limitContinuation: approval,
      });
      expect(resumed.result).toBeNull();
      expect(
        usageState.getSessionUsageLimitViolation(resumed.session),
      ).toBeNull();
      expect(resumed.session.history).toEqual(input.messages);
      // Approval grants a fresh window; recorded usage is not erased.
      expect(usageState.getSessionTokenUsage(resumed.session)).toEqual(
        usageState.getSessionTokenUsage(input.session),
      );
    },
  );

  it("reject cancels without erasing conversation or renewing the window", async () => {
    const input = fixture("input");
    const before = structuredClone(input.session);
    const violation = usageState.getSessionUsageLimitViolation(input.session);
    const request = continuation.createSessionLimitContinuationRequest({
      sessionId: input.session.sessionId,
      violation,
    });
    const rejection = continuation.resolveSessionLimitContinuation({
      requests: [request],
      responses: [{ requestId: request.requestId, optionId: "stop" }],
    });
    await expect(
      policy.applySessionLimitContinuation({
        ...input,
        limitContinuation: rejection,
      }),
    ).rejects.toBeInstanceOf(cancellation.SessionLimitDeclinedError);
    expect(input.session).toEqual(before);
    expect(
      usageState.getSessionUsageLimitViolation(input.session),
    ).not.toBeNull();
  });
});
