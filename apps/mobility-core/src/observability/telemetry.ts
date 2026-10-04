import { createHash } from "node:crypto";
import {
  redactText,
  safeProjection,
  type TelemetryBatch,
  telemetryBatch,
} from "@mobility/contracts";
import { DashboardAccessError } from "../dashboard/access";
import { boundedTransaction } from "./database";
export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function sanitize(batch: TelemetryBatch) {
  for (const p of batch.payloads) {
    for (const m of p.content.messages)
      for (const part of m.parts) {
        for (const field of ["text", "arguments", "output"] as const)
          if (field in part) {
            const item = part as unknown as Record<string, string>;
            const text = item[field] ?? "";
            if (
              field !== "text" ||
              p.kind === "tool_input" ||
              p.kind === "tool_output"
            ) {
              try {
                const projected = safeProjection(
                  JSON.parse(text),
                  p.kind === "tool_input" ? 8192 : 32000,
                );
                item[field] = JSON.stringify(projected.data);
                p.redacted ||= projected.redacted;
                p.truncated ||= projected.truncated;
              } catch {
                item[field] = redactText(text);
              }
            } else item[field] = redactText(text);
            p.redacted ||= item[field] !== text;
          }
      }
    for (const f of p.content.functions) {
      f.description = redactText(f.description);
      f.parametersJson = redactText(f.parametersJson);
    }
    p.retainedBytes = Buffer.byteLength(JSON.stringify(p.content));
    p.originalBytes = Math.max(p.originalBytes, p.retainedBytes);
    const max =
      p.kind === "model_input"
        ? 512000
        : p.kind === "model_output"
          ? 64000
          : p.kind === "tool_input"
            ? 8192
            : 32000;
    if (p.retainedBytes > max) {
      p.content = { messages: [], functions: [] };
      p.retainedBytes = Buffer.byteLength(JSON.stringify(p.content));
      p.truncated = true;
      p.captureStatus = "omitted";
    }
  }
  return batch;
}
export async function storeTelemetry(value: unknown) {
  const b = sanitize(telemetryBatch.parse(value));
  return boundedTransaction(async (c) => {
    const owner = await c.query(
      `SELECT 1 FROM evaluation_session s JOIN evaluator e ON e.id=s.evaluator_id WHERE s.session_id=$1 AND e.id=$2 AND e.enabled AND e.expires_at>now() AND s.expires_at>now() AND s.revoked_at IS NULL`,
      [b.sessionId, b.principalId],
    );
    if (!owner.rowCount) throw new DashboardAccessError(404, "not_found");
    await c.query(
      `INSERT INTO observability_quota(evaluator_id) VALUES($1) ON CONFLICT DO NOTHING`,
      [b.principalId],
    );
    await c.query(
      `SELECT evaluator_id FROM observability_quota WHERE evaluator_id=$1 FOR UPDATE`,
      [b.principalId],
    );
    const first = b.events.reduce(
      (a, e) => (e.occurredAt < a ? e.occurredAt : a),
      b.events[0]?.occurredAt ?? new Date().toISOString(),
    );
    await c.query(
      `INSERT INTO conversation_observability(session_id,capture_started_at,first_observed_at,last_observed_at,expires_at)
      VALUES($1,$2,$2,$2,$2::timestamptz+interval '7 days') ON CONFLICT DO NOTHING`,
      [b.sessionId, first],
    );
    const info = await c.query(
      `SELECT retained_bytes,event_count,expires_at>now() AS active FROM conversation_observability WHERE session_id=$1 FOR UPDATE`,
      [b.sessionId],
    );
    if (!info.rows[0]?.active)
      return { accepted: false, reason: "capture_expired" };
    const refs = new Map<string, string>();
    let omitted = 0;
    for (const p of b.payloads) {
      if (
        Date.parse(p.capturedAt) > Date.now() + 30000 ||
        Date.parse(p.capturedAt) < Date.now() - 7 * 86400000
      ) {
        omitted++;
        continue;
      }
      const h = hash(p.content);
      const sameId = await c.query(
        `SELECT session_id,content_hash,kind,original_bytes,retained_bytes,redacted,truncated,capture_status,reason,captured_at FROM conversation_trace_payload WHERE id=$1`,
        [p.id],
      );
      if (
        sameId.rowCount &&
        (sameId.rows[0].session_id !== b.sessionId ||
          sameId.rows[0].content_hash !== h ||
          sameId.rows[0].kind !== p.kind ||
          Number(sameId.rows[0].original_bytes) !== p.originalBytes ||
          Number(sameId.rows[0].retained_bytes) !== p.retainedBytes ||
          sameId.rows[0].redacted !== p.redacted ||
          sameId.rows[0].truncated !== p.truncated ||
          sameId.rows[0].capture_status !== p.captureStatus ||
          sameId.rows[0].reason !== p.reason ||
          new Date(sameId.rows[0].captured_at).getTime() !==
            Date.parse(p.capturedAt))
      )
        throw new DashboardAccessError(409, "conflicting_id");
      const existing = await c.query(
        `SELECT id FROM conversation_trace_payload WHERE session_id=$1 AND content_hash=$2 AND kind=$3 AND expires_at>now()`,
        [b.sessionId, h, p.kind],
      );
      if (existing.rowCount) {
        refs.set(p.id, existing.rows[0].id);
        continue;
      }
      const quota = await c.query(
        `UPDATE observability_quota SET retained_bytes=retained_bytes+$2 WHERE evaluator_id=$1 AND retained_bytes+reserved_bytes+$2<=268435456 RETURNING evaluator_id`,
        [b.principalId, p.retainedBytes],
      );
      if (!quota.rowCount) {
        omitted++;
        continue;
      }
      const session = await c.query(
        `UPDATE conversation_observability SET retained_bytes=retained_bytes+$2 WHERE session_id=$1 AND retained_bytes+$2<=16777216 RETURNING session_id`,
        [b.sessionId, p.retainedBytes],
      );
      if (!session.rowCount) {
        await c.query(
          `UPDATE observability_quota SET retained_bytes=retained_bytes-$2 WHERE evaluator_id=$1`,
          [b.principalId, p.retainedBytes],
        );
        omitted++;
        continue;
      }
      await c.query(
        `INSERT INTO conversation_trace_payload(id,session_id,content_hash,kind,schema_version,content,original_bytes,retained_bytes,redacted,truncated,capture_status,reason,captured_at,expires_at)
        VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11,$12,$12::timestamptz+interval '7 days')`,
        [
          p.id,
          b.sessionId,
          h,
          p.kind,
          JSON.stringify(p.content),
          p.originalBytes,
          p.retainedBytes,
          p.redacted,
          p.truncated,
          p.captureStatus,
          p.reason,
          p.capturedAt,
        ],
      );
      refs.set(p.id, p.id);
    }
    const acknowledged: string[] = [];
    for (const e of b.events) {
      if (
        Date.parse(e.occurredAt) > Date.now() + 30000 ||
        Date.parse(e.occurredAt) < Date.now() - 7 * 86400000
      ) {
        omitted++;
        continue;
      }
      const h = hash(e);
      const old = await c.query(
        `SELECT content_hash FROM conversation_trace_event WHERE session_id=$1 AND event_key=$2`,
        [b.sessionId, e.eventKey],
      );
      if (old.rowCount) {
        if (old.rows[0].content_hash !== h)
          throw new DashboardAccessError(409, "conflicting_id");
        acknowledged.push(e.eventKey);
        continue;
      }
      const count = await c.query(
        `UPDATE conversation_observability SET event_count=event_count+1 WHERE session_id=$1 AND event_count<10000 RETURNING session_id`,
        [b.sessionId],
      );
      if (!count.rowCount) {
        omitted++;
        continue;
      }
      const links: (string | null)[] = [];
      for (const id of e.payloadIds) {
        if (refs.has(id)) links.push(refs.get(id) ?? null);
        else {
          const found = await c.query(
            `SELECT id FROM conversation_trace_payload WHERE id=$1 AND session_id=$2 AND expires_at>now()`,
            [id, b.sessionId],
          );
          links.push(found.rows[0]?.id ?? null);
        }
      }
      const missing = links.some((id) => !id);
      while (links.length < 4) links.push(null);
      await c.query(
        `INSERT INTO conversation_trace_event(session_id,event_key,content_hash,kind,occurred_at,expires_at,turn_id,step_index,sequence,purpose,attempt_id,call_id,tool,provider_response_id,status,duration_ms,is_error,error_code,input_tokens,output_tokens,cached_input_tokens,reasoning_tokens,payload_1,payload_2,payload_3,payload_4,capture_status,sent_call_ids)
        VALUES($1,$2,$3,$4,$5,$5::timestamptz+interval '7 days',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
        [
          b.sessionId,
          e.eventKey,
          h,
          e.kind,
          e.occurredAt,
          e.turnId,
          e.stepIndex,
          e.sequence,
          e.purpose,
          e.attemptId,
          e.callId,
          e.tool,
          e.providerResponseId,
          e.status,
          e.durationMs,
          e.isError,
          e.errorCode,
          e.usage?.inputTokens ?? null,
          e.usage?.outputTokens ?? null,
          e.usage?.cachedInputTokens ?? null,
          e.usage?.reasoningTokens ?? null,
          ...links,
          missing ? "missing" : e.captureStatus,
          e.sentCallIds,
        ],
      );
      if (missing) omitted++;
      acknowledged.push(e.eventKey);
    }
    await c.query(
      `UPDATE conversation_observability SET last_observed_at=GREATEST(last_observed_at,$2::timestamptz),known_gaps=known_gaps+$3,coverage=CASE WHEN $3>0 THEN 'partial' ELSE coverage END WHERE session_id=$1`,
      [b.sessionId, b.events.at(-1)?.occurredAt ?? first, omitted],
    );
    return {
      accepted: true,
      acknowledged,
      payloads: Object.fromEntries(refs),
      coverage: "best_effort",
    };
  });
}
