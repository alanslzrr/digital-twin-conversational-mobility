import { createOpenAI } from "@ai-sdk/openai";

export const MODEL_ID = "gpt-6-luna";

// Resolve only when a model step starts: builds never need credentials or inference.
export function createEvaluationModel() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey)
    throw new Error("OPENAI_API_KEY is required to run a model step");
  return createOpenAI({ apiKey }).responses(MODEL_ID);
}
