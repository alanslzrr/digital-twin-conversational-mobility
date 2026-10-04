/** Null means unreported. Partial sums carry their own independent denominator. */
export function sumReported(rows: Record<string, unknown>[], field: string) {
  const known = rows.filter(
    (r) =>
      typeof r[field] === "number" ||
      (typeof r[field] === "string" && /^\d+$/.test(r[field] as string)),
  );
  return {
    value: known.length
      ? known.reduce((n, r) => n + Number(r[field]), 0)
      : null,
    reported: known.length,
    observed: rows.length,
    partial: known.length < rows.length,
  };
}
export function attemptUsage(rows: Record<string, unknown>[]) {
  const both = rows.filter(
    (r) => r.input_tokens != null && r.output_tokens != null,
  );
  return {
    inputTokens: sumReported(rows, "input_tokens").value,
    outputTokens: sumReported(rows, "output_tokens").value,
    cachedInputTokens: sumReported(rows, "cached_input_tokens").value,
    reasoningTokens: sumReported(rows, "reasoning_tokens").value,
    totalTokens: both.length
      ? both.reduce(
          (n, r) => n + Number(r.input_tokens) + Number(r.output_tokens),
          0,
        )
      : null,
    coverage: {
      input: sumReported(rows, "input_tokens"),
      output: sumReported(rows, "output_tokens"),
      cache: sumReported(rows, "cached_input_tokens"),
      reasoning: sumReported(rows, "reasoning_tokens"),
      total: {
        reported: both.length,
        observed: rows.length,
        partial: both.length < rows.length,
      },
    },
  };
}
