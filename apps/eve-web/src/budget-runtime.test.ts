import type { ModelMessage } from "ai";
import type { HookContext } from "eve/hooks";
import type {
  MemoryCompactionCompletedContext,
  MemoryCompactionRequestedContext,
  MemoryProvider,
  MemoryTurnStartedContext,
} from "eve/memory";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => new Map<string, unknown>());
const access = vi.hoisted(() =>
  vi.fn(async (_input: Record<string, unknown>) => Response.json({ ok: true })),
);
vi.mock("eve/context", () => ({
  defineState: (name: string, initial: () => unknown) => ({
    get: () => (state.has(name) ? state.get(name) : initial()),
    update: (fn: (s: unknown) => unknown) =>
      state.set(name, fn(state.has(name) ? state.get(name) : initial())),
  }),
}));
vi.mock("./evaluator-auth", () => ({ coreAccess: access }));

import hook from "../agent/hooks/conversation-budget";
import memory from "../agent/memory/evidence";
import { budgetContext, currentBudgetContext } from "./budget-context";

const provider: MemoryProvider = memory.provider;
const meta = { id: "synthetic-event", at: "2026-09-25T00:00:00Z" };
const ctx = {
  session: {
    id: "session",
    auth: {
      current: {
        principalId: "principal",
        issuer: "mobility-evaluation",
        authenticator: "evaluator-password",
        principalType: "user",
      },
    },
  },
} as HookContext;
beforeEach(() => {
  state.clear();
  access.mockClear();
  access.mockResolvedValue(Response.json({ ok: true }));
});
describe("EVE authored budget and memory integration", () => {
  it("requires Better Auth-derived evaluator identity before binding context", async () => {
    expect(currentBudgetContext).toThrow();
    const event = {
      type: "step.started" as const,
      meta,
      data: {
        turnId: "turn",
        stepIndex: 0,
        sequence: 1,
        modelId: "gpt-6-luna",
      },
    };
    await expect(
      hook.events?.["step.started"]?.(event, {
        ...ctx,
        session: { ...ctx.session, auth: { current: null, initiator: null } },
      }),
    ).rejects.toThrow("Authenticated");
    await hook.events?.["step.started"]?.(event, ctx);
    expect(access).toHaveBeenCalledWith({
      action: "register",
      principalId: "principal",
      sessionId: "session",
    });
    expect(currentBudgetContext()).toMatchObject({
      turnId: "turn",
      purpose: "step",
      sessionId: "session",
    });
  });
  it.each(["", "new-compaction-turn"])(
    "uses the pinned context rather than standalone compaction event %s",
    async (eventTurnId) => {
      budgetContext.update(() => ({
        principalId: "principal",
        sessionId: "session",
        turnId: "compact-turn",
        stepIndex: 2,
        purpose: "step",
      }));
      state.set("mobility.llm-binding.v1", { turnId: "compact-turn" });
      await hook.events?.["compaction.requested"]?.(
        {
          type: "compaction.requested",
          meta,
          data: {
            turnId: eventTurnId,
            sessionId: "session",
            sequence: 3,
            modelId: "gpt-6-luna",
            usageInputTokens: null,
          },
        },
        ctx,
      );
      expect(currentBudgetContext()).toMatchObject({
        turnId: "compact-turn",
        purpose: "compaction",
      });
      await hook.events?.["compaction.completed"]?.(
        {
          type: "compaction.completed",
          meta,
          data: {
            turnId: "compact-turn",
            sessionId: "session",
            sequence: 4,
            modelId: "gpt-6-luna",
          },
        },
        ctx,
      );
      expect(currentBudgetContext()).toMatchObject({
        purpose: "step",
        turnId: "compact-turn",
        stepIndex: 2,
      });
    },
  );
  it("recalls exact evidence after a destructive summary, across replay and the next turn", async () => {
    const messages: ModelMessage[] = [
      {
        role: "user",
        content:
          "Colón mañana 2026-09-26; no escaleras; fuente antigua, plazas desconocidas",
      },
    ];
    const capture = {
      messages,
      operationId: "capture1",
    } as unknown as MemoryCompactionRequestedContext;
    await provider.capture?.["compaction.requested"]?.(capture);
    await provider.capture?.["compaction.requested"]?.(capture);
    const recalled = await provider.recall["compaction.completed"]?.({
      messages: [{ role: "assistant", content: "Cero plazas actuales" }],
    } as unknown as MemoryCompactionCompletedContext);
    expect(JSON.stringify(recalled)).toContain("plazas desconocidas");
    expect(JSON.stringify(recalled)).not.toContain("Cero plazas actuales");
    expect(
      await provider.recall["turn.started"]({} as MemoryTurnStartedContext),
    ).toEqual(recalled);
  });
  it("late replay of an older compaction operation cannot reorder evidence", async () => {
    const capture = (operationId: string, text: string) =>
      ({
        messages: [{ role: "user", content: text }],
        operationId,
      }) as unknown as MemoryCompactionRequestedContext;
    await provider.capture?.["compaction.requested"]?.(
      capture("one", "Atocha"),
    );
    await provider.capture?.["compaction.requested"]?.(
      capture("two", "Corrección: Colón"),
    );
    const before = await provider.recall["turn.started"](
      {} as MemoryTurnStartedContext,
    );
    await provider.capture?.["compaction.requested"]?.(
      capture("one", "Atocha"),
    );
    expect(
      await provider.recall["turn.started"]({} as MemoryTurnStartedContext),
    ).toEqual(before);
  });
  it("capture overflow throws before a checkpoint and retains prior durable evidence", async () => {
    await provider.capture?.["compaction.requested"]?.({
      messages: [{ role: "user", content: "Original" }],
      operationId: "one",
    } as unknown as MemoryCompactionRequestedContext);
    await expect(async () =>
      provider.capture?.["compaction.requested"]?.({
        messages: [{ role: "user", content: "x".repeat(64001) }],
        operationId: "two",
      } as unknown as MemoryCompactionRequestedContext),
    ).rejects.toThrow("original history");
    expect(
      JSON.stringify(
        await provider.recall["turn.started"]({} as MemoryTurnStartedContext),
      ),
    ).toContain("Original");
  });
});
