import type { TurnBinding } from "@mobility/contracts";
import { defineState } from "eve/context";

// Safe, durable references only. No external credential or authorization bearer.
export const llmBinding = defineState<TurnBinding | null>(
  "mobility.llm-binding.v1",
  () => null,
);
