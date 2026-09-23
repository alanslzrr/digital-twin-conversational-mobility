import { defineAgent, defineDynamic } from "eve";

export default defineAgent({
  defaultTools: false,
  model: defineDynamic({
    events: {
      "session.started": () => {
        const model = process.env.EVE_MODEL?.trim();
        if (!model?.startsWith("openai/")) {
          throw new Error(
            "Configure EVE_MODEL with an OpenAI Gateway model before starting a session",
          );
        }
        return model;
      },
    },
  }),
  limits: {
    maxInputTokensPerSession: 100_000,
    maxOutputTokensPerSession: 10_000,
    sessionTimeoutMs: 30 * 60 * 1_000,
  },
});
