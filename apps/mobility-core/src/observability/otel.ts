import { otelBatch, traceEnrichmentEnabled } from "@mobility/contracts";
import { DashboardAccessError } from "../dashboard/access";
import { boundedTransaction } from "./database";

export async function enrichTelemetry(value: unknown) {
  if (!traceEnrichmentEnabled(process.env))
    throw new DashboardAccessError(404, "not_found");
  const batch = otelBatch.parse(value);
  // Drop ambiguous mappings, not unrelated spans sharing their delivery batch.
  const targets = new Map<string, (typeof batch.spans)[number]>();
  const conflicts = new Set<string>();
  const identities = new Map<string, string>();
  for (const item of batch.spans) {
    const key = JSON.stringify(item.target),
      previous = targets.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(item))
      conflicts.add(key);
    targets.set(key, item);
    const identity = `${item.span.traceId}:${item.span.spanId}`;
    const priorTarget = identities.get(identity);
    if (priorTarget && priorTarget !== key) {
      conflicts.add(priorTarget);
      conflicts.add(key);
    }
    identities.set(identity, key);
  }
  const spans = [...targets]
    .filter(([key]) => !conflicts.has(key))
    .map(([, item]) => item);
  return boundedTransaction(async (sql) => {
    const owner = await sql.query(
      `SELECT 1 FROM evaluation_session s JOIN evaluator e ON e.id=s.evaluator_id
       WHERE s.session_id=$1 AND e.id=$2 AND e.enabled AND e.expires_at>now()
       AND s.expires_at>now() AND s.revoked_at IS NULL`,
      [batch.sessionId, batch.principalId],
    );
    if (!owner.rowCount) throw new DashboardAccessError(404, "not_found");
    // Same observability lock order as event capture; never acquire budget/ledger locks.
    await sql.query(
      `SELECT evaluator_id FROM observability_quota WHERE evaluator_id=$1 FOR UPDATE`,
      [batch.principalId],
    );
    // Model terminals are emitted inside EVE's native call, before it ends.
    // Reject a terminal outside that interval (1ms timestamp precision), but
    // count ALL coordinate matches first: time must never select between retries.
    const result = await sql.query(
      `WITH incoming AS (
        SELECT value->'target' AS target,value->'span' AS span,ordinality AS n
        FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY
      ), candidates AS (
        SELECT i.n,i.span,e.id,e.otel_span,count(*) OVER(PARTITION BY i.n) AS matches,
          (i.target->>'kind'<>'model' OR e.occurred_at BETWEEN
            (i.span->>'startedAt')::timestamptz-interval '1 millisecond' AND
            (i.span->>'endedAt')::timestamptz+interval '1 millisecond') AS in_interval
        FROM incoming i JOIN conversation_trace_event e ON e.session_id=$1
        JOIN conversation_observability o ON o.session_id=e.session_id AND o.expires_at>now()
        WHERE e.expires_at>now() AND (i.span->>'endedAt')::timestamptz<=now()+interval '30 seconds'
        AND (i.span->>'startedAt')::timestamptz>=now()-interval '7 days'
        AND CASE i.target->>'kind'
          WHEN 'turn' THEN e.turn_id=i.target->>'turnId' AND e.kind IN ('turn_completed','turn_failed','turn_cancelled')
          WHEN 'step' THEN e.turn_id=i.target->>'turnId' AND e.step_index=(i.target->>'stepIndex')::int AND e.kind='step_completed'
          WHEN 'model' THEN e.turn_id=i.target->>'turnId' AND e.step_index=(i.target->>'stepIndex')::int
            AND e.purpose=i.target->>'purpose' AND e.attempt_id IS NOT NULL
            AND e.kind IN ('attempt_completed','attempt_incomplete','attempt_failed','attempt_cancelled')
          WHEN 'tool' THEN e.call_id=i.target->>'callId' AND e.kind IN ('tool_result','tool_cancelled')
          ELSE false END
      ), updated AS (
        UPDATE conversation_trace_event e SET otel_span=c.span FROM candidates c
        WHERE e.id=c.id AND c.matches=1 AND c.in_interval AND (e.otel_span IS NULL OR e.otel_span=c.span)
        AND NOT EXISTS (
          SELECT 1 FROM conversation_trace_event other WHERE other.session_id=e.session_id
          AND other.otel_span IS NOT NULL AND other.id<>e.id
          AND other.otel_span->>'traceId'=c.span->>'traceId'
          AND other.otel_span->>'spanId'=c.span->>'spanId'
        )
        RETURNING e.id
      ) SELECT (SELECT count(*)::int FROM updated) AS attached,
        (SELECT count(*)::int FROM incoming)-(SELECT count(*)::int FROM updated) AS unmatched`,
      [batch.sessionId, JSON.stringify(spans)],
    );
    // No inserts, changed event hashes, extended retention, usage counters, or budget writes.
    return {
      attached: Number(result.rows[0]?.attached ?? 0),
      unmatched: Number(result.rows[0]?.unmatched ?? 0) + conflicts.size,
      coverage: "best_effort",
    };
  });
}
