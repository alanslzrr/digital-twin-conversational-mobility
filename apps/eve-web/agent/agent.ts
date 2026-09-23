import { defineAgent, defineDynamic } from "eve";
import { createEvaluationModel } from "../src/model";

export default defineAgent({
  defaultTools: false,
  model: defineDynamic({
    events: {
      "step.started": () => ({
        model: createEvaluationModel(),
        modelContextWindowTokens: 1_050_000,
        modelOptions: { providerOptions: { openai: { store: false } } },
      }),
    },
  }),
  limits: {
    maxInputTokensPerSession: 100_000,
    maxOutputTokensPerSession: 10_000,
    sessionTimeoutMs: 30 * 60 * 1_000,
  },
});
