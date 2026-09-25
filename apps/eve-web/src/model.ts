import { createOpenAI } from "@ai-sdk/openai";

import { currentBudgetContext } from "./budget-context";
import { budgetedFetch } from "./budgeted-fetch";

export const MODEL_ID = "gpt-6-luna";

// Resolve only when a model step starts: builds never need credentials or inference.
export function createEvaluationModel() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey)
    throw new Error("OPENAI_API_KEY is required to run a model step");
  return createOpenAI({
    apiKey,
    fetch: budgetedFetch(currentBudgetContext),
  }).responses(MODEL_ID);
}
