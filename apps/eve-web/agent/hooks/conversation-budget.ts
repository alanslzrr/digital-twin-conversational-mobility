import { defineHook, type HookContext } from "eve/hooks";
import { budgetContext } from "../../src/budget-context";
import { coreAccess } from "../../src/evaluator-auth";
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
  const registered = await coreAccess({
    action: "register",
    principalId: auth.principalId,
    sessionId: ctx.session.id,
  });
  if (!registered.ok) throw new Error("Evaluator session unavailable");
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
    "step.started": (event, ctx) =>
      bind(ctx, event.data.turnId, event.data.stepIndex, "step"),
    "compaction.requested": (event, ctx) =>
      bind(
        ctx,
        event.data.turnId,
        budgetContext.get()?.stepIndex ?? 0,
        "compaction",
      ),
    "compaction.completed": (_event, _ctx) => {
      budgetContext.update((value) =>
        value ? { ...value, purpose: "step" } : null,
      );
    },
  },
});
