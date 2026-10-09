import type { LlmUsage, ModelProfile } from "@mobility/contracts";

export function verifiedPrices(model: ModelProfile, now = Date.now()) {
  return (
    model.inputMicrosPerMillion !== null &&
    model.outputMicrosPerMillion !== null &&
    model.pricesValidUntil !== null &&
    Date.parse(model.pricesValidUntil) > now
  );
}
function micros(tokens: number, rate: number) {
  // Integer arithmetic, round up once per component: never round a reservation down.
  const amount = (BigInt(tokens) * BigInt(rate) + 999_999n) / 1_000_000n;
  if (amount > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Cost outside safe range");
  return Number(amount);
}
export function tokenCost(
  model: ModelProfile,
  input: number,
  output: number,
  cached = 0,
) {
  if (
    model.inputMicrosPerMillion === null ||
    model.outputMicrosPerMillion === null
  )
    return null;
  const cacheRate = model.cacheMicrosPerMillion ?? model.inputMicrosPerMillion;
  const cost =
    micros(input - cached, model.inputMicrosPerMillion) +
    micros(cached, cacheRate) +
    micros(output, model.outputMicrosPerMillion);
  if (!Number.isSafeInteger(cost)) throw new Error("Cost outside safe range");
  return cost;
}
export function usageCost(model: ModelProfile, usage: LlmUsage) {
  return (
    usage.reportedCostMicros ??
    tokenCost(
      model,
      usage.inputTokens,
      usage.outputTokens,
      usage.cachedTokens ?? 0,
    )
  );
}
export function reservationCost(model: ModelProfile, output: number) {
  // A provider-neutral upper bound. No assumption about a tokenizer or /input_tokens API.
  return tokenCost(model, model.contextTokens, output);
}
