import { defineHook, type HookContext } from "eve/hooks";
import { budgetContext, preCompactionContext } from "../../src/budget-context";
import { runtimeControl } from "../../src/control-client";
import { coreAccess } from "../../src/evaluator-auth";
import { llmBinding } from "../../src/llm-state";
import { bindTelemetry } from "../../src/telemetry";

async function bind(
  ctx: HookContext,
  turnId: string,
  stepIndex: number,
  purpose: "step" | "compaction",
) {
  const auth = ctx.session.auth.current;
  if (
    auth?.issuer !== "mobility-evaluation" ||
    auth.authenticator !== "evaluator-password" ||
    auth.principalType !== "user"
  )
    throw new Error("Authenticated evaluator required");
  // Trusted runtime identity closes the create-response registration race; Core still verifies ownership.
  const selectionId = auth.attributes?.mobaiSelectionId;
  if (typeof selectionId === "string") {
    await runtimeControl({
      action: "session.register",
      principalId: auth.principalId,
      sessionId: ctx.session.id,
      selectionId,
    });
  } else {
    const registered = await coreAccess({
      action: "register",
      principalId: auth.principalId,
      sessionId: ctx.session.id,
    });
    if (!registered.ok) throw new Error("Evaluator session unavailable");
  }
  await bindTelemetry(auth.principalId, ctx.session.id);
  budgetContext.update(() => ({
    principalId: auth.principalId,
    sessionId: ctx.session.id,
    turnId,
    stepIndex,
    purpose,
  }));
}
export default defineHook({
  events: {
    "turn.started": (event, ctx) => bind(ctx, event.data.turnId, 0, "step"),
    "step.started": (event, ctx) =>
      bind(ctx, event.data.turnId, event.data.stepIndex, "step"),
    "compaction.requested": (event, ctx) => {
      preCompactionContext.update(() => budgetContext.get());
      return bind(
        ctx,
        llmBinding.get()?.turnId || event.data.turnId || "",
        event.data.sequence,
        "compaction",
      );
    },
    "compaction.completed": (_event, _ctx) => {
      budgetContext.update(() => preCompactionContext.get());
      preCompactionContext.update(() => null);
    },
    "input.requested": (event, ctx) =>
      finishTurn(ctx, event.data.turnId, "waiting"),
    "turn.completed": (event, ctx) =>
      finishTurn(ctx, event.data.turnId, "completed"),
    "turn.failed": (event, ctx) => finishTurn(ctx, event.data.turnId, "failed"),
    "turn.cancelled": (event, ctx) =>
      finishTurn(ctx, event.data.turnId, "cancelled"),
  },
});
async function finishTurn(
  ctx: HookContext,
  turnId: string,
  status: "completed" | "failed" | "cancelled" | "waiting",
) {
  const auth = ctx.session.auth.current;
  if (!auth) return;
  await runtimeControl({
    action: "turn.finish",
    principalId: auth.principalId,
    sessionId: ctx.session.id,
    turnId,
    status,
  });
}
