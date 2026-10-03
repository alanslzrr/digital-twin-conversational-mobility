/** Presentation helpers. No fetching, persistence, new DTOs, or provider execution. */
export type Tone = "neutral" | "positive" | "negative";
export interface ComparableSample {
  metricId: string;
  selectionKey: string;
  /** Proven identity of the contributing population, NOT its record count. */
  cohortKey: string | null;
  aggregationKey: string;
  unit: string;
  value: number | null;
  evaluatedAt: string;
  windowMs: number | null;
  comparable: boolean;
}
export type Comparison =
  | {
      status: "unavailable" | "not-comparable";
      reason: string;
      tone: "neutral";
    }
  | {
      status: "available";
      delta: number;
      relativePercent: number | null;
      unit: string;
      tone: Tone;
      baselineAt: string;
    };
export interface ComparisonOptions {
  displayUnit?: "native" | "percentage-points";
  maxSeparationMs: number;
  /** Omit for M1, M2 and M3. A policy is a product decision, not a color choice. */
  policy?: { id: string; desirable: "higher" | "lower" };
}
function timestamp(value: string): number {
  // Date-only and local date strings are not valid evidence instants here.
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  return Date.parse(value);
}
export function compareSamples(
  current: ComparableSample,
  previous: ComparableSample | null,
  options: ComparisonOptions,
): Comparison {
  const unavailable = (reason: string): Comparison => ({
    status: "unavailable",
    reason,
    tone: "neutral",
  });
  const mismatch = (reason: string): Comparison => ({
    status: "not-comparable",
    reason,
    tone: "neutral",
  });
  if (!Number.isFinite(options.maxSeparationMs) || options.maxSeparationMs <= 0)
    return mismatch("Comparison window is not defined.");
  if (current.value === null || !Number.isFinite(current.value))
    return unavailable("Current value unavailable.");
  if (!previous || previous.value === null || !Number.isFinite(previous.value))
    return unavailable("No verified baseline.");
  if (!current.comparable || !previous.comparable)
    return mismatch("Evidence is not comparable.");
  for (const key of [
    "metricId",
    "selectionKey",
    "aggregationKey",
    "unit",
  ] as const) {
    if (!current[key] || current[key] !== previous[key])
      return mismatch(`Different ${key}.`);
  }
  if (!current.cohortKey || current.cohortKey !== previous.cohortKey)
    return mismatch("Contributing population is not verified as unchanged.");
  if (
    current.windowMs !== previous.windowMs ||
    (current.windowMs !== null &&
      (!Number.isFinite(current.windowMs) || current.windowMs <= 0))
  )
    return mismatch("Different or invalid aggregation windows.");
  const now = timestamp(current.evaluatedAt),
    before = timestamp(previous.evaluatedAt);
  if (!Number.isFinite(now) || !Number.isFinite(before) || before >= now)
    return mismatch("Baseline must be an earlier evidence instant.");
  if (now - before > options.maxSeparationMs)
    return mismatch("Baseline is outside the allowed comparison interval.");
  if (
    options.displayUnit === "percentage-points" &&
    (current.unit !== "%" ||
      current.value < 0 ||
      current.value > 100 ||
      previous.value < 0 ||
      previous.value > 100)
  )
    return mismatch(
      "Percentage-point comparison requires percentage values on a 0–100 scale.",
    );
  const delta = current.value - previous.value;
  if (!Number.isFinite(delta))
    return mismatch("Change exceeds the supported numeric range.");
  const relative =
    previous.value === 0 ? null : (delta / Math.abs(previous.value)) * 100;
  let tone: Tone = "neutral";
  if (delta !== 0 && options.policy?.id.trim()) {
    const favorable =
      options.policy.desirable === "higher" ? delta > 0 : delta < 0;
    tone = favorable ? "positive" : "negative";
  }
  return {
    status: "available",
    delta,
    relativePercent:
      relative !== null && Number.isFinite(relative) ? relative : null,
    unit: options.displayUnit === "percentage-points" ? "pp" : current.unit,
    tone,
    baselineAt: previous.evaluatedAt,
  };
}
export interface PartitionInput {
  total: number | null;
  recent: number | null;
  stale: number | null;
  unavailable: number | null;
}
export type Partition =
  | { status: "unavailable" | "inconsistent" | "empty"; reason: string }
  | {
      status: "available";
      total: number;
      parts: {
        id: "recent" | "stale" | "unavailable";
        count: number;
        fraction: number;
      }[];
    };
const validCount = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;
export function partitionCounts(input: PartitionInput): Partition {
  const values = [input.total, input.recent, input.stale, input.unavailable];
  if (values.some((n) => n === null))
    return { status: "unavailable", reason: "Breakdown unavailable." };
  if (values.some((n) => !validCount(n as number)))
    return { status: "inconsistent", reason: "Invalid count in breakdown." };
  const { total, recent, stale, unavailable } = input as Record<
    keyof PartitionInput,
    number
  >;
  if (recent + stale + unavailable !== total)
    return {
      status: "inconsistent",
      reason: "Breakdown does not reconcile with the supplied total.",
    };
  if (total === 0)
    return { status: "empty", reason: "No records in this selection." };
  return {
    status: "available",
    total,
    parts: [
      { id: "recent", count: recent, fraction: recent / total },
      { id: "stale", count: stale, fraction: stale / total },
      { id: "unavailable", count: unavailable, fraction: unavailable / total },
    ],
  };
}
export interface HistoryPoint {
  observedAt: string;
  ingestedAt: string;
  revisionId: string;
  value: number;
}
export interface PlotPoint {
  at: number;
  value: number | null;
  revisionId: string | null;
  gap: boolean;
}
export type HistoryPlot =
  | { status: "available"; points: PlotPoint[]; gaps: number }
  | { status: "table-only"; reason: string; points: PlotPoint[]; gaps: 0 };
export function prepareHistory(
  points: readonly HistoryPoint[],
  gapSeconds: number,
): HistoryPlot {
  const fail = (reason: string): HistoryPlot => ({
    status: "table-only",
    reason,
    points: [],
    gaps: 0,
  });
  if (!Number.isFinite(gapSeconds) || gapSeconds < 0)
    return fail("Invalid gap policy.");
  if (points.length > 240)
    return fail("History exceeds the verified reader bound.");
  const sorted = points
    .map((p) => ({
      at: timestamp(p.observedAt),
      ingested: timestamp(p.ingestedAt),
      point: p,
    }))
    .sort((a, b) => a.at - b.at);
  if (
    sorted.some(
      (p) =>
        !Number.isFinite(p.at) ||
        !Number.isFinite(p.ingested) ||
        !Number.isFinite(p.point.value),
    )
  )
    return fail("Invalid history point. Inspect the exact records.");
  // Do not invent a winning revision policy for equal observation times.
  if (sorted.some((p, i) => i > 0 && p.at === (sorted[i - 1]?.at ?? p.at)))
    return fail(
      "Multiple records share an observation time. Inspect revisions in the table.",
    );
  const output: PlotPoint[] = [];
  let gaps = 0;
  sorted.forEach((p, i) => {
    if (i > 0 && p.at - (sorted[i - 1]?.at ?? p.at) > gapSeconds * 1000) {
      output.push({
        at: (p.at + (sorted[i - 1]?.at ?? p.at)) / 2,
        value: null,
        revisionId: null,
        gap: true,
      });
      gaps++;
    }
    output.push({
      at: p.at,
      value: p.point.value,
      revisionId: p.point.revisionId,
      gap: false,
    });
  });
  return { status: "available", points: output, gaps };
}
export interface UsageInput {
  input: number | null;
  output: number | null;
  cachedInput: number | null;
  reasoningOutput: number | null;
}
export function summarizeUsage(
  usage: UsageInput,
):
  | { status: "valid"; total: number | null; usage: UsageInput }
  | { status: "invalid"; reason: string } {
  if (Object.values(usage).some((n) => n !== null && !validCount(n)))
    return { status: "invalid", reason: "Invalid token count." };
  if (
    usage.input !== null &&
    usage.cachedInput !== null &&
    usage.cachedInput > usage.input
  )
    return {
      status: "invalid",
      reason: "Cached input exceeds its parent total.",
    };
  if (
    usage.output !== null &&
    usage.reasoningOutput !== null &&
    usage.reasoningOutput > usage.output
  )
    return {
      status: "invalid",
      reason: "Reasoning output exceeds its parent total.",
    };
  const total =
    usage.input === null || usage.output === null
      ? null
      : usage.input + usage.output;
  if (total !== null && !Number.isSafeInteger(total))
    return {
      status: "invalid",
      reason: "Token total exceeds safe integer range.",
    };
  return { status: "valid", total, usage };
}
export interface DurationGroup {
  component: string;
  operation: string;
  n: number;
  medianMs: number | null;
  p95Ms: number | null;
}
export function validateDuration(group: DurationGroup): boolean {
  if (
    !validCount(group.n) ||
    group.n === 0 ||
    !group.component ||
    !group.operation
  )
    return false;
  if (
    group.medianMs === null ||
    !Number.isFinite(group.medianMs) ||
    group.medianMs < 0
  )
    return false;
  if (group.n < 20) return group.p95Ms === null;
  return (
    group.p95Ms === null ||
    (Number.isFinite(group.p95Ms) && group.p95Ms >= group.medianMs)
  );
}

export interface SnapshotReading {
  metricId: string;
  selectionKey: string;
  unit: string;
  value: number | null;
  readAt: string;
  included: number | null;
  observed: number | null;
}
/** A factual difference between screen readings, NOT a comparable-cohort trend.
 * Keep the previous successful response only in memory, scoped to identity/query.
 * Never attach a green/red performance tone to this result. */
export type ReadingComparison =
  | {
      status: "unavailable" | "coverage-changed";
      reason: string;
      tone: "neutral";
    }
  | {
      status: "reading-change";
      delta: number;
      baselineAt: string;
      tone: "neutral";
    };
export function compareSnapshotReadings(
  current: SnapshotReading,
  previous: SnapshotReading | null,
  maxSeparationMs = 60_000,
): ReadingComparison {
  const fail = (reason: string) => ({
    status: "unavailable" as const,
    reason,
    tone: "neutral" as const,
  });
  if (!previous) return fail("No previous successful reading in this session.");
  if (!Number.isFinite(maxSeparationMs) || maxSeparationMs <= 0)
    return fail("Invalid reading interval.");
  if (
    !current.metricId ||
    current.metricId !== previous.metricId ||
    current.selectionKey !== previous.selectionKey ||
    current.unit !== previous.unit
  )
    return fail("Reading scope changed.");
  if (
    current.value === null ||
    previous.value === null ||
    !Number.isFinite(current.value) ||
    !Number.isFinite(previous.value)
  )
    return fail("A reading is unavailable.");
  if (
    current.unit === "%" &&
    (current.value < 0 ||
      current.value > 100 ||
      previous.value < 0 ||
      previous.value > 100)
  )
    return fail("Invalid percentage reading.");
  const now = timestamp(current.readAt),
    before = timestamp(previous.readAt);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(before) ||
    now <= before ||
    now - before > maxSeparationMs
  )
    return fail("Reading interval is not eligible.");
  for (const value of [
    current.included,
    current.observed,
    previous.included,
    previous.observed,
  ]) {
    if (value !== null && !validCount(value))
      return fail("Invalid coverage count.");
  }
  if (
    current.included !== previous.included ||
    current.observed !== previous.observed
  )
    return {
      status: "coverage-changed",
      reason: "Coverage changed between readings.",
      tone: "neutral",
    };
  const delta = current.value - previous.value;
  if (!Number.isFinite(delta))
    return fail("Reading difference exceeds numeric range.");
  return {
    status: "reading-change",
    delta,
    baselineAt: previous.readAt,
    tone: "neutral",
  };
}
