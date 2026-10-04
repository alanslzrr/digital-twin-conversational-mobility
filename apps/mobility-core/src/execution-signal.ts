import { AsyncLocalStorage } from "node:async_hooks";
export const executionSignal = new AsyncLocalStorage<AbortSignal>();
export function boundedSignal(signal: AbortSignal) {
  const parent = executionSignal.getStore();
  return parent ? AbortSignal.any([signal, parent]) : signal;
}
