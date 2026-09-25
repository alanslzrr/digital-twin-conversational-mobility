import { createOpenAI } from "@ai-sdk/openai";

import { currentBudgetContext } from "./budget-context";
import { budgetedFetch } from "./budgeted-fetch";

export const MODEL_ID = "gpt-6-luna";

// Resolve only when a model step starts: builds never need credentials or inference.
export function createEvaluationModel() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey)
    throw new Error("OPENAI_API_KEY is required to run a model step");
  const mode = process.env.MOBILITY_BUDGET_MODE ?? "interactive";
  if (mode !== "interactive" && mode !== "campaign")
    throw new Error("Invalid MOBILITY_BUDGET_MODE");
  return createOpenAI({
    apiKey,
    fetch: budgetedFetch(currentBudgetContext, undefined, undefined, mode),
  }).responses(MODEL_ID);
}
