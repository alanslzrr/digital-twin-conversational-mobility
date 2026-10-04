import { database } from "../database";
/** Called only from the existing activity-bounded maintenance path. */
export async function pruneObservability() {
  const sql = database();
  await sql.begin(async (tx) => {
    // Counters are separate from auth/chat quota. Lock in stable owner order.
    const payloads =
      await tx`SELECT p.id,p.session_id,p.retained_bytes,s.evaluator_id FROM conversation_trace_payload p JOIN evaluation_session s USING(session_id)
      WHERE p.expires_at<now() OR s.expires_at<now() OR s.revoked_at IS NOT NULL ORDER BY p.expires_at,p.id LIMIT 1000`;
    const executions =
      await tx`SELECT id,evaluator_id,retained_bytes,reserved_bytes FROM dashboard_tool_execution WHERE expires_at<now() ORDER BY expires_at,id LIMIT 1000`;
    const owners = [
      ...new Set(
        [...payloads, ...executions].map((r) => String(r.evaluator_id)),
      ),
    ].sort();
    for (const owner of owners)
      await tx`SELECT evaluator_id FROM observability_quota WHERE evaluator_id=${owner} FOR UPDATE`;
    for (const session of [
      ...new Set(payloads.map((p) => String(p.session_id))),
    ].sort())
      await tx`SELECT session_id FROM conversation_observability WHERE session_id=${session} FOR UPDATE`;
    // At most 1,000 reference-bearing events per maintenance pass.
    await tx`WITH expired AS (SELECT p.id,p.session_id FROM conversation_trace_payload p
      JOIN evaluation_session s USING(session_id) WHERE p.expires_at<now() OR s.expires_at<now() OR s.revoked_at IS NOT NULL),
      affected AS (SELECT e.id FROM conversation_trace_event e WHERE EXISTS(SELECT 1 FROM expired p WHERE p.session_id=e.session_id
        AND p.id IN(e.payload_1,e.payload_2,e.payload_3,e.payload_4)) ORDER BY e.id LIMIT 1000)
      UPDATE conversation_trace_event e SET
        payload_1=CASE WHEN EXISTS(SELECT 1 FROM expired p WHERE p.session_id=e.session_id AND p.id=e.payload_1) THEN NULL ELSE e.payload_1 END,
        payload_2=CASE WHEN EXISTS(SELECT 1 FROM expired p WHERE p.session_id=e.session_id AND p.id=e.payload_2) THEN NULL ELSE e.payload_2 END,
        payload_3=CASE WHEN EXISTS(SELECT 1 FROM expired p WHERE p.session_id=e.session_id AND p.id=e.payload_3) THEN NULL ELSE e.payload_3 END,
        payload_4=CASE WHEN EXISTS(SELECT 1 FROM expired p WHERE p.session_id=e.session_id AND p.id=e.payload_4) THEN NULL ELSE e.payload_4 END,
        capture_status='missing' WHERE e.id IN(SELECT id FROM affected)`;
    for (const p of payloads) {
      const deleted =
        await tx`DELETE FROM conversation_trace_payload p WHERE id=${p.id} AND NOT EXISTS(SELECT 1 FROM conversation_trace_event e WHERE e.session_id=p.session_id AND p.id IN(e.payload_1,e.payload_2,e.payload_3,e.payload_4)) RETURNING retained_bytes`;
      if (deleted.length) {
        await tx`UPDATE observability_quota SET retained_bytes=greatest(0,retained_bytes-${Number(p.retained_bytes)}) WHERE evaluator_id=${p.evaluator_id}`;
        await tx`UPDATE conversation_observability SET retained_bytes=greatest(0,retained_bytes-${Number(p.retained_bytes)}) WHERE session_id=${p.session_id}`;
      }
    }
    for (const x of executions) {
      const deleted =
        await tx`DELETE FROM dashboard_tool_execution WHERE id=${x.id} RETURNING id`;
      if (deleted.length)
        await tx`UPDATE observability_quota SET retained_bytes=greatest(0,retained_bytes-${Number(x.retained_bytes)}),reserved_bytes=greatest(0,reserved_bytes-${Number(x.reserved_bytes)}) WHERE evaluator_id=${x.evaluator_id}`;
    }
    await tx`DELETE FROM operational_event WHERE id IN (SELECT id FROM operational_event WHERE expires_at<now() ORDER BY expires_at,id LIMIT 1000)`;
    await tx`DELETE FROM conversation_trace_event WHERE id IN (SELECT id FROM conversation_trace_event WHERE expires_at<now() ORDER BY expires_at,id LIMIT 1000)`;
    await tx`DELETE FROM conversation_observability WHERE session_id IN (SELECT o.session_id FROM conversation_observability o WHERE expires_at<now() AND NOT EXISTS(SELECT 1 FROM conversation_trace_payload p WHERE p.session_id=o.session_id) AND NOT EXISTS(SELECT 1 FROM conversation_trace_event e WHERE e.session_id=o.session_id) LIMIT 1000)`;
    await tx`DELETE FROM dashboard_rate_window WHERE ctid IN (SELECT ctid FROM dashboard_rate_window WHERE expires_at<now() ORDER BY expires_at LIMIT 1000)`;
  });
}
