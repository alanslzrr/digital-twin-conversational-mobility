import { defineState } from "eve/context";
import type { BudgetContext } from "./budgeted-fetch";

export const budgetContext = defineState<BudgetContext | null>(
  "mobility.budget-context.v1",
  () => null,
);
export function currentBudgetContext(): BudgetContext {
  const context = budgetContext.get();
  if (!context) throw new Error("Authenticated budget context required");
  return context;
}
