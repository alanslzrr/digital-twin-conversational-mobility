import { z } from "zod";
import { conversationSessionId } from "./conversations";

// Shared switch; callers pass their environment. No environment or secret reads here.
export function traceEnrichmentEnabled(
  env: Record<string, string | undefined>,
) {
  return (
    env.MOBAI_OTEL_ENABLED === "true" &&
    env.VERCEL_ENV !== "preview" &&
    env.DEPLOYMENT_ENV !== "preview"
  );
}
const key = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_.:-]+$/);
const hex = (length: number) =>
  z
    .string()
    .regex(new RegExp(`^[0-9a-f]{${length}}$`))
    .refine((v) => /[1-9a-f]/.test(v));
export const otelSpan = z
  .strictObject({
    source: z.literal("eve@0.65.0"),
    kind: z.enum(["turn", "step", "model", "tool"]),
    traceId: hex(32),
    spanId: hex(16),
    parentSpanId: hex(16).nullable(),
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }),
    durationMs: z
      .number()
      .finite()
      .nonnegative()
      .max(24 * 60 * 60 * 1000),
  })
  .refine((s) => Date.parse(s.endedAt) >= Date.parse(s.startedAt))
  .refine(
    (s) =>
      Math.abs(
        Date.parse(s.endedAt) - Date.parse(s.startedAt) - s.durationMs,
      ) <= 1,
  );

export const otelTarget = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("turn"), turnId: key }),
  z.strictObject({
    kind: z.literal("step"),
    turnId: key,
    stepIndex: z.number().int().min(0).max(1_000_000),
  }),
  z.strictObject({
    kind: z.literal("model"),
    turnId: key,
    stepIndex: z.number().int().min(0).max(1_000_000),
    purpose: z.enum(["step", "compaction"]),
  }),
  z.strictObject({ kind: z.literal("tool"), callId: key }),
]);
export const otelEnrichment = z
  .strictObject({ target: otelTarget, span: otelSpan })
  .refine((v) => v.target.kind === v.span.kind);
export const otelBatch = z.strictObject({
  schemaVersion: z.literal(1),
  type: z.literal("otel_enrichment"),
  principalId: z.uuid(),
  sessionId: conversationSessionId,
  spans: z.array(otelEnrichment).min(1).max(32),
});
export type OtelSpan = z.infer<typeof otelSpan>;
export type OtelEnrichment = z.infer<typeof otelEnrichment>;
export type OtelBatch = z.infer<typeof otelBatch>;
