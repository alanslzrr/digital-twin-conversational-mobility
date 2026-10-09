import { turnBinding } from "@mobility/contracts";
import { defineAgent, defineDynamic } from "eve";
import { runtimeControl } from "../src/control-client";
import { llmBinding } from "../src/llm-state";
import { createEvaluationModel } from "../src/model";

export default defineAgent({
  defaultTools: false,
  model: defineDynamic({
    events: {
      "turn.started": async (event, ctx) => {
        const auth = ctx.session.auth.current;
        const turnId = (event as { data?: { turnId?: unknown } }).data?.turnId;
        const selectionId = auth?.attributes.mobaiSelectionId;
        if (
          auth?.issuer !== "mobility-evaluation" ||
          auth.authenticator !== "evaluator-password" ||
          auth.principalType !== "user" ||
          typeof selectionId !== "string" ||
          typeof turnId !== "string"
        )
          throw new Error("authentication_required");
        const binding = turnBinding.parse(
          await runtimeControl({
            action: "turn.bind",
            principalId: auth.principalId,
            sessionId: ctx.session.id,
            turnId,
            selectionId,
          }),
        );
        // No silent history truncation or compaction with a newly selected smaller model.
        if (
          Buffer.byteLength(JSON.stringify(ctx.messages)) +
            binding.outputLimit >
          binding.model.contextTokens
        ) {
          // Preserve the old binding for explicit compaction; release the newly rejected turn.
          await runtimeControl({
            action: "turn.finish",
            principalId: auth.principalId,
            sessionId: ctx.session.id,
            turnId,
            status: "failed",
          });
          throw new Error("context_exceeded");
        }
        llmBinding.update(() => binding);
        return {
          model: `mobai/${binding.model.modelId}`,
          modelContextWindowTokens: binding.model.contextTokens,
          ...(binding.model.protocol === "responses"
            ? {
                modelOptions: { providerOptions: { openai: { store: false } } },
              }
            : {}),
        };
      },
      // EVE persists turn selections, but SDK instances are live-only. Rehydrate
      // the already-authorized binding, never select a new provider/funding here.
      "step.started": async (_event, ctx) => {
        const binding = llmBinding.get();
        const auth = ctx.session.auth.current;
        if (
          !binding ||
          auth?.issuer !== "mobility-evaluation" ||
          auth.authenticator !== "evaluator-password" ||
          auth.principalType !== "user" ||
          auth.principalId !== binding.principalId ||
          ctx.session.id !== binding.sessionId
        )
          throw new Error("authentication_required");
        return {
          model: createEvaluationModel(binding),
          modelContextWindowTokens: binding.model.contextTokens,
          ...(binding.model.protocol === "responses"
            ? {
                modelOptions: { providerOptions: { openai: { store: false } } },
              }
            : {}),
        };
      },
    },
  }),
  limits: {
    maxInputTokensPerSession: 100_000,
    maxOutputTokensPerSession: 10_000,
    sessionTimeoutMs: 30 * 60 * 1_000,
  },
});
