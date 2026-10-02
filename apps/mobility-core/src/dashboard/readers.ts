import {
  conversationCursor,
  dashboardEventQuery,
  safeProjection,
} from "@mobility/contracts";
import { type JobId, jobPolicies } from "@mobility/domain";
import { getFreshness } from "@mobility/provenance";
import { listConversations } from "../conversations";
import { database } from "../database";
import { DashboardAccessError, requireTraceOwnership } from "./access";
import { decodeCursor, encodeCursor } from "./cursor";

const iso = (v: unknown) =>
  v instanceof Date
    ? v.toISOString()
    : typeof v === "string" && Number.isFinite(Date.parse(v))
      ? new Date(v).toISOString()
      : null;
export async function readSources(id?: string) {
  const sql = database();
  const sources = await sql.unsafe(
    "SELECT id,strategy,enabled FROM source_catalog WHERE ($1::text IS NULL OR id=$1) ORDER BY id",
    [id ?? null],
  );
  if (id && sources.length === 0)
    throw new DashboardAccessError(404, "not_found");
  const gates = await sql.unsafe(
    "SELECT 'osm' AS id,next_due_at,lease_until,failures,error_code,(SELECT count(*) FROM geocode_cache WHERE expires_at>now()) AS count FROM geocode_gate UNION ALL SELECT 'emt',next_due_at,lease_until,failures,error_code,NULL FROM emt_arrival_gate UNION ALL SELECT 'aemet',next_due_at,lease_until,0,NULL,NULL FROM weather_gate",
  );
  const jobs = await sql.unsafe(
    "SELECT j.id,j.source_id,j.next_due_at,j.last_attempt_at,j.last_finished_at,j.lease_until,j.failures,j.attempts,j.recovered_leases,j.error_code,j.error_stage,m.observed_at,m.ingested_at,m.quality,CASE WHEN m.payload IS NULL THEN NULL ELSE coalesce(jsonb_array_length(m.payload->'stations'),jsonb_array_length(m.payload->'readings'),jsonb_array_length(m.payload->'parkings'),jsonb_array_length(m.payload->'sensors'),jsonb_array_length(m.payload->'incidents'),jsonb_array_length(m.payload->'alerts'),jsonb_array_length(m.payload->'updates'),0) END AS count FROM ingestion_job j LEFT JOIN mobility_snapshot m ON m.job_id=j.id WHERE ($1::text IS NULL OR j.source_id=$1) ORDER BY j.id",
    [id ?? null],
  );
  const feeds = await sql.unsafe(
    "SELECT source_id AS id,version,service_start,service_end,imported_at FROM static_feed WHERE ($1::text IS NULL OR source_id=$1) ORDER BY source_id",
    [id ?? null],
  );
  const crtm =
    !id || id === "crtm"
      ? await sql.unsafe(
          "SELECT dataset_id AS id,version,service_start,service_end,imported_at,enabled FROM crtm_feed ORDER BY dataset_id LIMIT 100",
        )
      : [];
  const health = {
    sources: sources.map((s) => ({
      id: s.id,
      strategy: s.strategy,
      enabled: s.enabled,
      streams: jobs
        .filter((j) => j.source_id === s.id)
        .map((j) => {
          const observedAt = iso(j.observed_at),
            ingestedAt = iso(j.ingested_at);
          const threshold =
            j.id in jobPolicies ? jobPolicies[j.id as JobId].maxAge : 0;
          return {
            id: j.id,
            observedAt,
            ingestedAt,
            quality: j.quality ?? "unknown",
            count: j.count,
            countScope: "collection_only",
            freshness: getFreshness(
              observedAt && ingestedAt
                ? {
                    source: s.id,
                    observedAt,
                    ingestedAt,
                    quality: j.quality ?? "unknown",
                  }
                : null,
              threshold,
            ),
            nextDueAt: iso(j.next_due_at),
            lastAttemptAt: iso(j.last_attempt_at),
            lastFinishedAt: iso(j.last_finished_at),
            leaseUntil: iso(j.lease_until),
            failures: Number(j.failures),
            attempts: Number(j.attempts),
            recoveredLeases: Number(j.recovered_leases),
            errorCode: j.error_code,
            errorStage: j.error_stage,
            state:
              j.lease_until && new Date(j.lease_until).getTime() > Date.now()
                ? "running"
                : j.error_code
                  ? "backoff"
                  : "scheduled",
          };
        }),
      staticFeed: feeds
        .filter((f) => f.id === s.id)
        .map((f) => ({
          id: f.id,
          version: f.version,
          serviceStart: f.service_start,
          serviceEnd: f.service_end,
          importedAt: iso(f.imported_at),
        })),
      staticCatalogs:
        s.id === "crtm"
          ? crtm.map((f) => ({
              id: f.id,
              version: f.version,
              serviceStart: f.service_start,
              serviceEnd: f.service_end,
              importedAt: iso(f.imported_at),
              enabled: f.enabled,
            }))
          : [],
      coverage:
        "Metadata almacenada; los recuentos de colección no certifican frescura de cada entidad.",
    })),
  };
  const weather =
    !id || id === "aemet"
      ? await sql`SELECT resource,version,checked_at,fetched_at,issued_at,valid_from,valid_to,next_due_at,failures,error_code,lease_until,demanded_until FROM weather_product ORDER BY resource LIMIT 100`
      : [];
  const arrivals =
    !id || id === "emt"
      ? await sql`SELECT stop_id,observed_at,ingested_at,next_due_at,failures,error_code,lease_until FROM emt_arrival_cache ORDER BY stop_id LIMIT 100`
      : [];
  const routing =
    await sql`SELECT id,state,created_at,activated_at FROM routing_release ORDER BY created_at DESC LIMIT 1`.catch(
      () => [],
    );
  return safeProjection(
    {
      ...health,
      components: gates
        .filter((g) => !id || g.id === id)
        .map((g) => ({
          id: g.id,
          nextDueAt: iso(g.next_due_at),
          leaseUntil: iso(g.lease_until),
          failures: Number(g.failures),
          errorCode: g.error_code,
          count: g.count == null ? null : Number(g.count),
        })),
      resources: weather.map((r) => ({
        id: r.resource,
        version: r.version,
        checkedAt: iso(r.checked_at),
        fetchedAt: iso(r.fetched_at),
        issuedAt: iso(r.issued_at),
        validFrom: iso(r.valid_from),
        validTo: iso(r.valid_to),
        nextDueAt: iso(r.next_due_at),
        failures: r.failures,
        errorCode: r.error_code,
        leaseUntil: iso(r.lease_until),
      })),
      arrivals: arrivals.map((r) => ({
        id: r.stop_id,
        observedAt: iso(r.observed_at),
        ingestedAt: iso(r.ingested_at),
        nextDueAt: iso(r.next_due_at),
        failures: r.failures,
        errorCode: r.error_code,
      })),
      routes: routing.map((r) => ({
        id: r.id,
        state: r.state,
        activatedAt: iso(r.activated_at),
        createdAt: iso(r.created_at),
      })),
    },
    240000,
  ).data;
}
export async function readOperationalEvents(
  value: unknown,
  owner: string,
  detail?: string,
) {
  const i = dashboardEventQuery.parse(value);
  const selection = JSON.stringify({
    from: i.from,
    to: i.to,
    source: i.source ?? null,
    type: i.type ?? null,
    severity: i.severity ?? null,
  });
  const cursor = i.cursor ? decodeCursor(i.cursor) : null;
  if (cursor && (cursor.owner !== owner || cursor.selection !== selection))
    throw new DashboardAccessError(400, "invalid_cursor");
  const rows =
    await database()`SELECT id::text,event_type,component,severity,source_id,job_id,operation_id,outcome,error_code,error_stage,duration_ms,
    to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at,
    recorded_at,expires_at FROM operational_event WHERE expires_at>now() AND occurred_at BETWEEN ${i.from}::timestamptz AND ${i.to}::timestamptz
    AND (${i.source ?? null}::text IS NULL OR source_id=${i.source ?? null}) AND (${i.type ?? null}::text IS NULL OR event_type=${i.type ?? null})
    AND (${i.severity ?? null}::text IS NULL OR severity=${i.severity ?? null}) AND (${detail ?? null}::text IS NULL OR id::text=${detail ?? null})
    AND (${cursor?.at ? String(cursor.at) : null}::text::timestamptz IS NULL OR (occurred_at,id)<(${cursor?.at ? String(cursor.at) : null}::text::timestamptz,${String(cursor?.id ?? "0")}::bigint))
    ORDER BY occurred_at DESC,id DESC LIMIT ${i.limit + 1}`;
  if (detail && rows.length === 0)
    throw new DashboardAccessError(404, "not_found");
  const items = rows.slice(0, i.limit).map((r) => ({
    id: r.id,
    type: r.event_type,
    component: r.component,
    severity: r.severity,
    source: r.source_id,
    job: r.job_id,
    operationId: r.operation_id,
    outcome: r.outcome,
    errorCode: r.error_code,
    errorStage: r.error_stage,
    durationMs: r.duration_ms,
    occurredAt: r.occurred_at,
    recordedAt: iso(r.recorded_at),
    expiresAt: iso(r.expires_at),
  }));
  const last = rows[i.limit - 1];
  return {
    events: items,
    nextCursor:
      rows.length > i.limit && last
        ? encodeCursor({ owner, selection, at: last.occurred_at, id: last.id })
        : null,
    coverage: "best_effort",
    warning:
      "Solo eventos instrumentados desde la instalación; ausencia de eventos no demuestra ausencia de fallos.",
  };
}
export async function readConversationIndex(owner: string, cursor?: string) {
  const c = cursor ? conversationCursor.parse(JSON.parse(cursor)) : undefined;
  const list = await listConversations({
    action: "list_sessions",
    principalId: owner,
    ...(c ? { cursor: c } : {}),
  });
  if (!("sessions" in list.body))
    throw new DashboardAccessError(401, "evaluator_not_active");
  const ids = list.body.sessions.map((s) => s.sessionId);
  const telemetry = ids.length
    ? await database()`SELECT o.session_id,o.last_observed_at,o.coverage,o.event_count FROM conversation_observability o JOIN evaluation_session s USING(session_id)
    WHERE o.session_id=ANY(${ids}::text[]) AND s.evaluator_id=${owner} AND s.revoked_at IS NULL AND s.expires_at>now() AND o.expires_at>now()`
    : [];
  return {
    sessions: list.body.sessions.map((s) => ({
      ...s,
      lastActivityAt: iso(
        telemetry.find((t) => t.session_id === s.sessionId)?.last_observed_at,
      ),
      captureStatus:
        telemetry.find((t) => t.session_id === s.sessionId)?.coverage ??
        "not_instrumented",
      eventCount:
        telemetry.find((t) => t.session_id === s.sessionId)?.event_count ??
        null,
    })),
    nextCursor: list.body.nextCursor
      ? JSON.stringify(list.body.nextCursor)
      : null,
  };
}
export async function readTrace(
  owner: string,
  session: string,
  part: string,
  params: URLSearchParams,
  payloadId?: string,
) {
  await requireTraceOwnership(owner, session);
  const sql = database();
  const owned = sql`SELECT session_id FROM evaluation_session s JOIN evaluator e ON e.id=s.evaluator_id WHERE s.session_id=${session} AND e.id=${owner} AND e.enabled AND e.expires_at>now() AND s.revoked_at IS NULL AND s.expires_at>now()`;
  if (part === "payloads") {
    const [p] =
      await sql`SELECT p.kind,p.content,p.original_bytes,p.retained_bytes,p.redacted,p.truncated,p.capture_status,p.expires_at FROM conversation_trace_payload p WHERE p.session_id IN (${owned}) AND p.id=${payloadId ?? null}::uuid AND p.expires_at>now()`;
    if (!p) throw new DashboardAccessError(404, "content_expired_or_not_found");
    return {
      kind: p.kind,
      content: p.content,
      originalBytes: Number(p.original_bytes),
      retainedBytes: Number(p.retained_bytes),
      redacted: p.redacted,
      truncated: p.truncated,
      captureStatus: p.capture_status,
      expiresAt: iso(p.expires_at),
    };
  }
  if (part === "summary") {
    const [capture] =
      await sql`SELECT schema_version,capture_started_at,first_observed_at,last_observed_at,event_count,omitted_events,known_gaps,coverage,retained_bytes FROM conversation_observability WHERE session_id IN (${owned}) AND expires_at>now()`;
    if (!capture)
      return {
        captureStatus: "not_instrumented",
        warning: "Telemetría detallada no disponible para este periodo",
      };
    const attempts =
      await sql`SELECT DISTINCT ON(attempt_id) attempt_id,status,input_tokens,output_tokens,cached_input_tokens,reasoning_tokens,duration_ms,purpose,turn_id FROM conversation_trace_event
      WHERE session_id IN (${owned}) AND expires_at>now() AND attempt_id IS NOT NULL ORDER BY attempt_id,CASE WHEN kind IN ('attempt_completed','attempt_incomplete','attempt_failed','attempt_cancelled') THEN 0 ELSE 1 END,id DESC`;
    const [latest] =
      await sql`SELECT kind,status,occurred_at FROM conversation_trace_event WHERE session_id IN (${owned}) AND expires_at>now() ORDER BY CASE WHEN kind LIKE 'turn_%' THEN 0 ELSE 1 END,occurred_at DESC,id DESC LIMIT 1`;
    const terminal =
      latest &&
      /(?:completed|failed|cancelled|incomplete|finished)/.test(
        String(latest.kind),
      );
    const state = terminal
      ? String(latest.status ?? "completed")
      : latest && Date.now() - new Date(latest.occurred_at).getTime() < 60000
        ? "running"
        : "unknown";
    const reported = attempts.filter((a) => a.input_tokens !== null);
    return {
      state,
      captureStatus: capture.coverage,
      captureVersion: capture.schema_version,
      captureStartedAt: iso(capture.capture_started_at),
      firstObservedAt: iso(capture.first_observed_at),
      lastObservedAt: iso(capture.last_observed_at),
      eventCount: capture.event_count,
      omittedEvents: Number(capture.omitted_events),
      knownGaps: Number(capture.known_gaps),
      retainedBytes: Number(capture.retained_bytes),
      counts: {
        attempts: attempts.length,
        missing: attempts.length - reported.length,
        compactions: attempts.filter((a) => a.purpose === "compaction").length,
      },
      turns: [...new Set(attempts.map((a) => a.turn_id))].map((turnId) => {
        const group = attempts.filter((a) => a.turn_id === turnId);
        return {
          turnId,
          attempts: group.length,
          inputTokens: group.some((a) => a.input_tokens !== null)
            ? group.reduce((n, a) => n + Number(a.input_tokens ?? 0), 0)
            : null,
          outputTokens: group.some((a) => a.output_tokens !== null)
            ? group.reduce((n, a) => n + Number(a.output_tokens ?? 0), 0)
            : null,
          durationMs: group.some((a) => a.duration_ms !== null)
            ? group.reduce((n, a) => n + Number(a.duration_ms ?? 0), 0)
            : null,
        };
      }),
      limits: {
        sessionBytes: 16777216,
        evaluatorBytes: 268435456,
        sessionEvents: 10000,
        retentionDays: 7,
      },
      usage: {
        inputTokens: reported.length
          ? reported.reduce((n, a) => n + Number(a.input_tokens), 0)
          : null,
        outputTokens: reported.length
          ? reported.reduce((n, a) => n + Number(a.output_tokens ?? 0), 0)
          : null,
        reasoningTokens: reported.some((a) => a.reasoning_tokens === null)
          ? null
          : reported.reduce((n, a) => n + Number(a.reasoning_tokens ?? 0), 0),
        cachedInputTokens: reported.some((a) => a.cached_input_tokens === null)
          ? null
          : reported.reduce(
              (n, a) => n + Number(a.cached_input_tokens ?? 0),
              0,
            ),
      },
      warning:
        "Captura best-effort; caché es subconjunto de entrada. Coste monetario no disponible.",
    };
  }
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 50)));
  if (!Number.isInteger(limit))
    throw new DashboardAccessError(400, "invalid_request");
  const cursor = params.get("cursor")
    ? decodeCursor(params.get("cursor") ?? "")
    : null;
  const turn = params.get("turn"),
    kind = params.get("kind");
  if (
    cursor &&
    (cursor.owner !== owner ||
      cursor.session !== session ||
      cursor.turn !== turn ||
      cursor.kind !== kind)
  )
    throw new DashboardAccessError(400, "invalid_cursor");
  const rows =
    await sql`SELECT id::text,event_key,kind,status,turn_id,step_index,purpose,attempt_id,call_id,tool,provider_response_id,duration_ms,is_error,input_tokens,output_tokens,cached_input_tokens,payload_1,payload_2,payload_3,payload_4,capture_status,sent_call_ids,
      to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at FROM conversation_trace_event
      WHERE session_id IN (${owned}) AND expires_at>now() AND (${turn}::text IS NULL OR turn_id=${turn}) AND (${kind}::text IS NULL OR kind=${kind})
      AND (${cursor?.at ? String(cursor.at) : null}::text::timestamptz IS NULL OR (occurred_at,id)>(${cursor?.at ? String(cursor.at) : null}::text::timestamptz,${String(cursor?.id ?? "0")}::bigint)) ORDER BY occurred_at,id LIMIT ${limit + 1}`;
  const events = rows.slice(0, limit).map((r) => ({
    id: r.id,
    eventKey: r.event_key,
    kind: r.kind,
    status: r.status,
    turnId: r.turn_id,
    stepIndex: r.step_index,
    purpose: r.purpose,
    attemptId: r.attempt_id,
    callId: r.call_id,
    tool: r.tool,
    providerResponseId: r.provider_response_id,
    durationMs: r.duration_ms,
    isError: r.is_error,
    inputTokens: r.input_tokens === null ? null : Number(r.input_tokens),
    outputTokens: r.output_tokens === null ? null : Number(r.output_tokens),
    cachedInputTokens:
      r.cached_input_tokens === null ? null : Number(r.cached_input_tokens),
    payloadIds: [r.payload_1, r.payload_2, r.payload_3, r.payload_4].filter(
      Boolean,
    ),
    captureStatus: r.capture_status,
    sentCallIds: r.sent_call_ids,
    occurredAt: r.occurred_at,
  }));
  const last = rows[limit - 1];
  return {
    events,
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({
            owner,
            session,
            turn,
            kind,
            at: last.occurred_at,
            id: last.id,
          })
        : null,
  };
}
