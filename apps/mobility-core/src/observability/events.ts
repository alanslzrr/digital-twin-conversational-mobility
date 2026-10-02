import { createHash } from "node:crypto";
import { z } from "zod";
import { boundedTransaction } from "./database";

const eventSchema = z.strictObject({
  operationId: z.string().max(160),
  component: z.enum(["ingestion", "weather", "emt", "geocoder", "routing"]),
  type: z.enum([
    "publication",
    "refresh",
    "lease_lost",
    "lease_recovered",
    "release",
  ]),
  source: z.string().max(40),
  job: z.string().max(80),
  outcome: z.enum([
    "success",
    "historical_only",
    "error",
    "lease_lost",
    "storage_error",
  ]),
  durationMs: z.number().nonnegative(),
  errorCode: z
    .string()
    .regex(/^[a-z0-9_:-]{1,100}$/)
    .nullable(),
});
export async function recordOperationalEvent(
  input: z.infer<typeof eventSchema>,
) {
  try {
    const i = eventSchema.parse(input);
    const key = createHash("sha256")
      .update(JSON.stringify([i.operationId, i.type]))
      .digest("hex");
    await boundedTransaction(async (c) => {
      await c.query(
        `INSERT INTO operational_event(event_key,occurred_at,component,event_type,severity,source_id,job_id,operation_id,outcome,duration_ms,error_code)
      VALUES($1,now(),$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(event_key) DO NOTHING`,
        [
          key,
          i.component,
          i.type,
          i.outcome === "error" || i.outcome === "storage_error"
            ? "error"
            : i.outcome === "lease_lost"
              ? "warning"
              : "info",
          i.source,
          i.job,
          i.operationId,
          i.outcome,
          i.durationMs,
          i.errorCode,
        ],
      );
    });
  } catch {
    /* Observability never reverses a successful publication. */
  }
}
