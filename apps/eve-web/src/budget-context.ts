import { defineState } from "eve/context";
export type BudgetContext = {
  principalId: string;
  sessionId: string;
  turnId: string;
  stepIndex: number;
  purpose: "step" | "compaction";
};

export const budgetContext = defineState<BudgetContext | null>(
  "mobility.budget-context.v1",
  () => null,
);
export function currentBudgetContext(): BudgetContext {
  const context = budgetContext.get();
  if (!context) throw new Error("Authenticated budget context required");
  return context;
}

export const preCompactionContext = defineState<BudgetContext | null>(
  "mobility.pre-compaction-context.v1",
  () => null,
);
