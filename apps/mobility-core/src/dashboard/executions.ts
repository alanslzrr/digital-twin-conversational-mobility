import { randomUUID } from "node:crypto";
import { dashboardExecutionInput, safeProjection } from "@mobility/contracts";
import { database } from "../database";
import { executionSignal } from "../execution-signal";
import { hash } from "../observability/telemetry";
import { findMobilityTool } from "../tool-registry";
import { DashboardAccessError } from "./access";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export async function readExecution(owner: string, id: string) {
  const [row] =
    await database()`SELECT x.id,x.request_id,x.tool,x.input,x.result,
    CASE WHEN x.state='running' AND x.deadline_at<now() THEN 'outcome_unknown' ELSE x.state END AS state,
    x.created_at,x.completed_at,x.expires_at,x.truncated,x.error_code FROM dashboard_tool_execution x
    JOIN evaluator e ON e.id=x.evaluator_id WHERE e.id=${owner} AND e.enabled AND e.expires_at>now()
    AND (x.id=${id}::uuid OR x.request_id=${id}::uuid) AND x.expires_at>now()`;
  if (!row) throw new DashboardAccessError(404, "not_found");
  return {
    id: row.id,
    requestId: row.request_id,
    tool: row.tool,
    input: row.input,
    result: row.result,
    state: row.state,
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at
      ? new Date(row.completed_at).toISOString()
      : null,
    expiresAt: new Date(row.expires_at).toISOString(),
    truncated: row.truncated,
    errorCode: row.error_code,
  };
}
export async function executeManual(
  owner: string,
  value: unknown,
  signal: AbortSignal,
  scopes: string[],
) {
  const i = dashboardExecutionInput.parse(value);
  const tool = findMobilityTool(i.tool);
  if (!tool || !scopes.includes(tool.scope))
    throw new DashboardAccessError(403, "insufficient_scope");
  const parsed = tool.config.inputSchema.parse(i.input);
  if (Buffer.byteLength(JSON.stringify(parsed)) > 8192)
    throw new DashboardAccessError(413, "request_too_large");
  const requestHash = hash(canonical({ tool: i.tool, input: parsed }));
  const input = safeProjection(parsed, 8192, Object.keys(parsed));
  const sql = database();
  const reservation = await sql.begin(async (tx) => {
    await tx`INSERT INTO observability_quota(evaluator_id) VALUES(${owner}) ON CONFLICT DO NOTHING`;
    await tx`SELECT evaluator_id FROM observability_quota WHERE evaluator_id=${owner} FOR UPDATE`;
    const [old] =
      await tx`SELECT id,request_hash FROM dashboard_tool_execution WHERE evaluator_id=${owner} AND request_id=${i.requestId}`;
    if (old) {
      if (old.request_hash !== requestHash)
        throw new DashboardAccessError(409, "conflicting_request");
      return { id: String(old.id), run: false };
    }
    const expired =
      await tx`UPDATE dashboard_tool_execution SET state='outcome_unknown',reserved_bytes=0 WHERE evaluator_id=${owner} AND state='running' AND lease_until<now() RETURNING id`;
    if (expired.length)
      await tx`UPDATE observability_quota SET reserved_bytes=greatest(0,reserved_bytes-${expired.length * 264192}) WHERE evaluator_id=${owner}`;
    const running =
      await tx`SELECT 1 FROM dashboard_tool_execution WHERE evaluator_id=${owner} AND state='running'`;
    if (running.length)
      throw new DashboardAccessError(409, "execution_in_progress");
    const quota =
      await tx`UPDATE observability_quota SET reserved_bytes=reserved_bytes+264192 WHERE evaluator_id=${owner} AND retained_bytes+reserved_bytes+264192<=268435456 RETURNING evaluator_id`;
    if (!quota.length) throw new DashboardAccessError(429, "content_limit");
    const id = randomUUID();
    await tx`INSERT INTO dashboard_tool_execution(id,evaluator_id,request_id,request_hash,tool,input,state,deadline_at,lease_until,reserved_bytes)
      VALUES(${id},${owner},${i.requestId},${requestHash},${i.tool},${tx.json(input.data as never)},'running',now()+interval '60 seconds',now()+interval '70 seconds',264192)`;
    return { id, run: true };
  });
  if (!reservation.run) return readExecution(owner, reservation.id);
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(60000)]);
  let state = "succeeded",
    error: string | null = null;
  let output: unknown = null;
  try {
    const wire = await new Promise<Awaited<ReturnType<typeof tool.execute>>>(
      (resolve, reject) => {
        const abort = () => reject(new Error("execution_deadline"));
        if (deadline.aborted) {
          abort();
          return;
        }
        deadline.addEventListener("abort", abort, { once: true });
        executionSignal
          .run(deadline, () => tool.execute(parsed))
          .then(resolve, reject)
          .finally(() => deadline.removeEventListener("abort", abort));
      },
    );
    if (deadline.aborted) {
      state = "outcome_unknown";
      error = "execution_cancelled_or_timed_out";
    } else {
      state = "isError" in wire && wire.isError ? "failed" : "succeeded";
      output = JSON.parse(wire.content[0]?.text ?? "null");
    }
  } catch {
    state = deadline.aborted ? "outcome_unknown" : "failed";
    error = "tool_execution_failed";
  }
  const projected = safeProjection(output, 256000);
  await sql.begin(async (tx) => {
    await tx`SELECT evaluator_id FROM observability_quota WHERE evaluator_id=${owner} FOR UPDATE`;
    const [row] =
      await tx`SELECT reserved_bytes,retained_bytes FROM dashboard_tool_execution WHERE id=${reservation.id} AND evaluator_id=${owner} FOR UPDATE`;
    if (!row) return;
    let bytes = input.retainedBytes + projected.retainedBytes;
    const stored =
      await tx`UPDATE observability_quota SET reserved_bytes=greatest(0,reserved_bytes-${Number(row.reserved_bytes)}),retained_bytes=retained_bytes+${bytes}
      WHERE evaluator_id=${owner} AND retained_bytes+reserved_bytes-${Number(row.reserved_bytes)}+${bytes}<=268435456 RETURNING evaluator_id`;
    if (!stored.length) {
      bytes = 0;
      await tx`UPDATE observability_quota SET reserved_bytes=greatest(0,reserved_bytes-${Number(row.reserved_bytes)}) WHERE evaluator_id=${owner}`;
    }
    await tx`UPDATE dashboard_tool_execution SET state=${state},completed_at=now(),result=${bytes ? tx.json(projected.data as never) : null},input=${bytes ? tx.json(input.data as never) : tx.json({})},retained_bytes=${bytes},reserved_bytes=0,truncated=${projected.truncated || !bytes},error_code=${error} WHERE id=${reservation.id} AND evaluator_id=${owner}`;
  });
  return readExecution(owner, reservation.id);
}
