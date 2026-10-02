import { randomUUID } from "node:crypto";
import type { TelemetryPayload } from "@mobility/contracts";
import { contextFootprint } from "./context-footprint";
import { coreAccess } from "./evaluator-auth";
import { sendTelemetry, event as traceEvent } from "./telemetry";
import { projectPayload } from "./telemetry-projection";

export type BudgetContext = {
  principalId: string;
  sessionId: string;
  turnId: string;
  stepIndex: number;
  purpose: "step" | "compaction";
};
export type Usage = { input: number; output: number; cached: number | null };
const endpoint = "https://api.openai.com/v1/responses";
const fail = () => new Error("Conversation budget unavailable or exhausted");
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
export function responseUsage(value: unknown): Usage | null {
  const usage = object(value);
  const cached = object(usage.input_tokens_details).cached_tokens;
  if (
    !integer(usage.input_tokens) ||
    !integer(usage.output_tokens) ||
    (cached !== undefined && !integer(cached))
  )
    return null;
  if (typeof cached === "number" && cached > usage.input_tokens) return null;
  return {
    input: usage.input_tokens,
    output: usage.output_tokens,
    cached: typeof cached === "number" ? cached : null,
  };
}

/** Every SDK retry enters here again. No grant can dispatch twice. */
export function budgetedFetch(
  context: () => BudgetContext,
  access: typeof coreAccess = coreAccess,
  network: typeof fetch = globalThis.fetch,
  mode: "campaign" | "interactive" = "campaign",
): typeof fetch {
  return async (url, init) => {
    if (
      String(url) !== endpoint ||
      init?.method !== "POST" ||
      typeof init.body !== "string" ||
      Buffer.byteLength(init.body) > 512_000
    )
      throw fail();
    const body = object(JSON.parse(init.body));
    if (
      body.model !== "gpt-6-luna" ||
      body.previous_response_id ||
      body.conversation ||
      body.background ||
      (Array.isArray(body.tools) &&
        body.tools.some((tool) => object(tool).type !== "function"))
    )
      throw fail();
    const scope = context();
    const attemptId = randomUUID();
    const identity = {
      principalId: scope.principalId,
      sessionId: scope.sessionId,
      attemptId,
    };
    const call = async (action: Record<string, unknown>) => {
      const result = await access({ ...identity, ...action });
      if (!result.ok) throw fail();
      return object(await result.json());
    };
    const startedAt = Date.now();
    const monotonicStart = performance.now();
    let inputPayload: TelemetryPayload | null = null;
    let terminalResponse: Record<string, unknown> | null = null;
    let terminalState:
      | "unknown"
      | "succeeded"
      | "incomplete"
      | "failed"
      | "cancelled" = "unknown";
    // Interactive sessions use EVE's server-side approval gate, not an operator campaign.
    // Campaign mode remains an explicit opt-in for separately bounded experiments.
    const grant =
      mode === "campaign"
        ? await call({
            action: "budget_begin",
            turnId: scope.turnId,
            stepIndex: scope.stepIndex,
            purpose: scope.purpose,
          })
        : {
            inputLimit: 0,
            outputLimit: 2048,
            deadline: new Date(startedAt + 60_000).toISOString(),
          };
    if (
      !integer(grant.inputLimit) ||
      !integer(grant.outputLimit) ||
      typeof grant.deadline !== "string"
    )
      throw fail();
    const remaining = Date.parse(grant.deadline) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 60_100)
      throw fail();
    const signal = AbortSignal.any([
      AbortSignal.timeout(Math.ceil(remaining)),
      ...(init.signal ? [init.signal] : []),
    ]);
    let dispatched = false;
    let finished = false;
    const finish = async (usage: Usage | null) => {
      if (finished) return;
      if (mode === "campaign")
        await call({ action: "budget_finish", notSent: !dispatched, usage });
      console.info(
        JSON.stringify({
          kind: "mobility.provider.metric",
          attemptId,
          sessionId: scope.sessionId,
          turnId: scope.turnId,
          stepIndex: scope.stepIndex,
          purpose: scope.purpose,
          mode,
          dispatched,
          latencyMs: Date.now() - startedAt,
          inputTokens: usage?.input ?? null,
          outputTokens: usage?.output ?? null,
          cacheReadTokens: usage?.cached ?? null,
        }),
      );
      finished = true;
      try {
        const output = terminalResponse
          ? projectPayload(terminalResponse, "model_output")
          : null;
        const status = signal.aborted ? "cancelled" : terminalState;
        const payloads = [inputPayload, output].filter(
          (p): p is TelemetryPayload => p !== null,
        );
        const rawUsage = object(terminalResponse?.usage);
        const reasoning = object(
          rawUsage.output_tokens_details,
        ).reasoning_tokens;
        await sendTelemetry(
          scope.principalId,
          scope.sessionId,
          [
            traceEvent({
              eventKey: `${attemptId}:terminal`,
              kind:
                status === "cancelled"
                  ? "attempt_cancelled"
                  : status === "succeeded"
                    ? "attempt_completed"
                    : status === "incomplete"
                      ? "attempt_incomplete"
                      : "attempt_failed",
              status,
              attemptId,
              turnId: scope.turnId,
              stepIndex: scope.stepIndex,
              purpose: scope.purpose,
              providerResponseId:
                typeof terminalResponse?.id === "string"
                  ? terminalResponse.id
                  : null,
              durationMs: performance.now() - monotonicStart,
              usage: usage
                ? {
                    inputTokens: usage.input,
                    outputTokens: usage.output,
                    cachedInputTokens: usage.cached,
                    reasoningTokens: integer(reasoning) ? reasoning : null,
                  }
                : null,
              payloadIds: payloads.map((p) => p.id),
              captureStatus: output ? output.captureStatus : "missing",
              sentCallIds:
                dispatched && Array.isArray(body.input)
                  ? body.input
                      .filter(
                        (item) =>
                          object(item).type === "function_call_output" &&
                          typeof object(item).call_id === "string",
                      )
                      .map((item) => String(object(item).call_id))
                      .slice(0, 128)
                  : [],
            }),
          ],
          payloads,
        );
      } catch {
        /* Payload/sink failures cannot change the result of inference. */
      }
    };
    try {
      body.store = false;
      body.max_output_tokens = Math.min(
        integer(body.max_output_tokens) && body.max_output_tokens > 0
          ? body.max_output_tokens
          : grant.outputLimit,
        grant.outputLimit,
      );
      try {
        inputPayload = projectPayload(body, "model_input");
        await sendTelemetry(
          scope.principalId,
          scope.sessionId,
          [
            traceEvent({
              eventKey: `${attemptId}:prepared`,
              kind: "attempt_prepared",
              status: "prepared",
              attemptId,
              turnId: scope.turnId,
              stepIndex: scope.stepIndex,
              purpose: scope.purpose,
              payloadIds: [inputPayload.id],
              captureStatus: inputPayload.captureStatus,
            }),
          ],
          [inputPayload],
        );
      } catch {
        /* safe projection is best effort */
      }
      console.info(
        JSON.stringify({
          kind: "mobility.context.metric",
          attemptId,
          sessionId: scope.sessionId,
          turnId: scope.turnId,
          purpose: scope.purpose,
          ...contextFootprint(body),
        }),
      );
      if (mode === "campaign") {
        // Count the same context, schemas and formatting used for generation; no local tokenizer estimate.
        const countBody = Object.fromEntries(
          [
            "model",
            "input",
            "instructions",
            "tools",
            "tool_choice",
            "parallel_tool_calls",
            "text",
            "reasoning",
            "truncation",
          ]
            .filter((key) => body[key] !== undefined)
            .map((key) => [key, body[key]]),
        );
        const counted = await network(`${endpoint}/input_tokens`, {
          ...init,
          redirect: "error",
          signal,
          body: JSON.stringify(countBody),
        });
        if (!counted.ok) {
          await counted.body?.cancel();
          throw fail();
        }
        const count = object(JSON.parse(await boundedText(counted)));
        if (
          count.object !== "response.input_tokens" ||
          !integer(count.input_tokens) ||
          count.input_tokens <= 0 ||
          count.input_tokens > grant.inputLimit
        )
          throw fail();
        signal.throwIfAborted();
        // Treat a lost dispatch response as possibly dispatched: never refund it.
        dispatched = true;
        await call({
          action: "budget_dispatch",
          inputTokens: count.input_tokens,
        });
      } else {
        dispatched = true;
      }
      signal.throwIfAborted();
      try {
        await sendTelemetry(scope.principalId, scope.sessionId, [
          traceEvent({
            eventKey: `${attemptId}:dispatch`,
            kind: "attempt_dispatched",
            status: "running",
            attemptId,
            turnId: scope.turnId,
            stepIndex: scope.stepIndex,
            purpose: scope.purpose,
          }),
        ]);
      } catch {
        /* Observability cannot prevent provider dispatch. */
      }
      const response = await network(url, {
        ...init,
        redirect: "error",
        signal,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        await response.body?.cancel();
        terminalState = "failed";
        await finish(null); // Even 5xx/cancellation are not proof of zero usage.
        throw fail();
      }
      if (!body.stream) {
        const text = await boundedText(response);
        terminalResponse = object(JSON.parse(text));
        terminalState =
          terminalResponse.status === "incomplete"
            ? "incomplete"
            : terminalResponse.status === "failed"
              ? "failed"
              : terminalResponse.status === "cancelled"
                ? "cancelled"
                : terminalResponse.status === "completed"
                  ? "succeeded"
                  : "unknown";
        await finish(responseUsage(terminalResponse.usage));
        return new Response(text, {
          status: response.status,
          headers: response.headers,
        });
      }
      const reader = response.body?.getReader();
      if (!reader) throw fail();
      let pending = "";
      const decoder = new TextDecoder();
      let usage: Usage | null = null;
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const item = await reader.read();
            if (item.done) {
              await finish(usage);
              controller.close();
              return;
            }
            pending += decoder.decode(item.value, { stream: true });
            if (pending.length > 1_000_000) throw fail();
            let newline = pending.indexOf("\n");
            while (newline >= 0) {
              const line = pending.slice(0, newline).trimEnd();
              pending = pending.slice(newline + 1);
              if (line.startsWith("data:")) {
                const data = line.slice(5).trim();
                if (data !== "[DONE]") {
                  const event = object(JSON.parse(data));
                  if (
                    event.type === "response.completed" ||
                    event.type === "response.incomplete" ||
                    event.type === "response.failed"
                  ) {
                    terminalResponse = object(event.response);
                    terminalState =
                      event.type === "response.completed"
                        ? "succeeded"
                        : event.type === "response.incomplete"
                          ? "incomplete"
                          : "failed";
                    usage = responseUsage(terminalResponse.usage);
                  }
                }
              }
              newline = pending.indexOf("\n");
            }
            controller.enqueue(item.value);
          } catch {
            await reader.cancel().catch(() => {});
            await finish(null).catch(() => {});
            controller.error(fail());
          }
        },
        async cancel() {
          terminalState = "cancelled";
          await reader.cancel().catch(() => {});
          await finish(null).catch(() => {});
        },
      });
      return new Response(stream, {
        status: response.status,
        headers: response.headers,
      });
    } catch {
      await finish(null).catch(() => {}); // Failure to reconcile keeps the durable reservation.
      throw fail();
    }
  };
}
async function boundedText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw fail();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) return Buffer.concat(chunks).toString("utf8");
      size += part.value.byteLength;
      if (size > 2_000_000) throw fail();
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}
