import type {
  TelemetryEvent,
  TelemetryPayload,
  TurnBinding,
} from "@mobility/contracts";
import type { BudgetContext } from "./budget-context";
import { event, sendTelemetry } from "./telemetry";
import { projectPayload, record } from "./telemetry-projection";

/** Secondary projection only. Never admits, retries or bills an inference. */
export async function observeModelResponse(
  binding: TurnBinding,
  scope: BudgetContext,
  request: Record<string, unknown>,
  response: Response,
  started: number,
) {
  const attemptId = response.headers.get("x-mobai-attempt");
  if (!attemptId) return response;
  let input: TelemetryPayload | null = null,
    terminal: Record<string, unknown> | null = null;
  let state: TelemetryEvent["status"] = "unknown";
  let finalUsage = false;
  const sentCallIds = (
    binding.model.protocol === "responses"
      ? Array.isArray(request.input)
        ? request.input
        : []
      : Array.isArray(request.messages)
        ? request.messages
        : []
  )
    .flatMap((v) => {
      const item = record(v);
      return item.type === "function_call_output" &&
        typeof item.call_id === "string"
        ? [item.call_id]
        : item.role === "tool" && typeof item.tool_call_id === "string"
          ? [item.tool_call_id]
          : [];
    })
    .slice(0, 128);
  const emit = async (
    kind: TelemetryEvent["kind"],
    status: TelemetryEvent["status"],
    output: TelemetryPayload | null = null,
  ) => {
    try {
      const u = record(terminal?.usage),
        chat = binding.model.protocol === "chat-completions";
      const number = (v: unknown) =>
        typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
      const i = number(chat ? u.prompt_tokens : u.input_tokens),
        o = number(chat ? u.completion_tokens : u.output_tokens);
      const payloads = [input, output].filter(
        (v): v is TelemetryPayload => v !== null,
      );
      await sendTelemetry(
        scope.principalId,
        scope.sessionId,
        [
          event({
            eventKey: `${attemptId}:${kind}`,
            kind,
            status,
            attemptId,
            turnId: scope.turnId,
            stepIndex: scope.stepIndex,
            purpose: scope.purpose,
            durationMs: Math.max(0, performance.now() - started),
            providerResponseId:
              typeof terminal?.id === "string" ? terminal.id : null,
            usage:
              finalUsage && i !== null && o !== null
                ? {
                    inputTokens: i,
                    outputTokens: o,
                    cachedInputTokens: number(
                      record(
                        chat ? u.prompt_tokens_details : u.input_tokens_details,
                      ).cached_tokens ?? u.prompt_cache_hit_tokens,
                    ),
                    reasoningTokens: number(
                      record(
                        chat
                          ? u.completion_tokens_details
                          : u.output_tokens_details,
                      ).reasoning_tokens,
                    ),
                  }
                : null,
            captureStatus:
              output?.captureStatus ?? input?.captureStatus ?? "missing",
            payloadIds: payloads.map((p) => p.id),
            sentCallIds,
          }),
        ],
        payloads,
      );
    } catch {
      /* Failure of this projection cannot fail or repeat the model call. */
    }
  };
  try {
    input = projectPayload(request, "model_input");
  } catch {}
  await emit("attempt_prepared", "running");
  const finish = async (cancelled = false) => {
    let output: TelemetryPayload | null = null;
    try {
      if (terminal) output = projectPayload(terminal, "model_output");
    } catch {}
    await emit(
      cancelled
        ? "attempt_cancelled"
        : state === "succeeded"
          ? "attempt_completed"
          : state === "incomplete"
            ? "attempt_incomplete"
            : "attempt_failed",
      cancelled ? "cancelled" : state,
      output,
    );
  };
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    try {
      terminal = record(await response.clone().json());
      finalUsage = true;
      state = response.ok
        ? terminal.status === "failed"
          ? "failed"
          : terminal.status === "incomplete"
            ? "incomplete"
            : "succeeded"
        : "failed";
    } catch {}
    await finish();
    return response;
  }
  const reader = response.body?.getReader();
  if (!reader) return response;
  const decoder = new TextDecoder();
  let pending = "",
    outputText = "",
    observing = true;
  const toolCalls = new Map<
    number,
    {
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }
  >();
  function observe(chunk: Uint8Array, done = false) {
    if (!observing) return;
    pending += decoder.decode(chunk, { stream: !done });
    if (pending.length + outputText.length > 512_000) {
      observing = false;
      terminal = null;
      return;
    }
    pending = pending.replace(/\r\n/g, "\n");
    if (done && pending.trim()) pending += "\n\n";
    let index = pending.indexOf("\n\n");
    while (index >= 0) {
      const frame = pending.slice(0, index);
      pending = pending.slice(index + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (data === "[DONE]") {
        if (
          binding.model.protocol === "chat-completions" &&
          state === "unknown"
        )
          state = "succeeded";
        if (binding.model.protocol === "chat-completions") finalUsage = true;
      } else if (data) {
        const chunk = record(JSON.parse(data));
        if (binding.model.protocol === "responses") {
          if (
            [
              "response.completed",
              "response.incomplete",
              "response.failed",
            ].includes(String(chunk.type))
          ) {
            terminal = record(chunk.response);
            finalUsage = true;
            state =
              chunk.type === "response.completed"
                ? "succeeded"
                : chunk.type === "response.incomplete"
                  ? "incomplete"
                  : "failed";
          }
        } else {
          const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
          const usageChunk =
            choices.length === 0 ||
            choices.some((c) => typeof record(c).finish_reason === "string");
          terminal = {
            ...terminal,
            id: chunk.id,
            ...(chunk.usage && usageChunk ? { usage: chunk.usage } : {}),
          };
          for (const raw of Array.isArray(chunk.choices) ? chunk.choices : []) {
            const choice = record(raw),
              delta = record(choice.delta);
            if (typeof delta.content === "string") outputText += delta.content;
            if (choice.finish_reason === "length") state = "incomplete";
            for (const rawCall of Array.isArray(delta.tool_calls)
              ? delta.tool_calls
              : []) {
              const call = record(rawCall),
                fn = record(call.function);
              if (
                typeof call.index !== "number" ||
                call.index < 0 ||
                call.index > 32
              )
                continue;
              const value = toolCalls.get(call.index) ?? {
                id: "",
                type: "function" as const,
                function: { name: "", arguments: "" },
              };
              if (typeof call.id === "string") value.id = call.id;
              if (typeof fn.name === "string") value.function.name += fn.name;
              if (typeof fn.arguments === "string")
                value.function.arguments += fn.arguments;
              if (value.function.arguments.length > 32_000) {
                observing = false;
                terminal = null;
                return;
              }
              toolCalls.set(call.index, value);
            }
          }
          terminal.choices = [
            {
              message: {
                role: "assistant",
                content: outputText,
                tool_calls: [...toolCalls.values()],
              },
            },
          ];
        }
      }
      index = pending.indexOf("\n\n");
    }
  }
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        let part: ReadableStreamReadResult<Uint8Array>;
        try {
          part = await reader.read();
        } catch (error) {
          await finish();
          controller.error(error);
          return;
        }
        try {
          observe(part.value ?? new Uint8Array(), part.done);
        } catch {
          observing = false;
          terminal = null;
        }
        if (part.done) {
          await finish();
          controller.close();
        } else controller.enqueue(part.value);
      },
      async cancel() {
        await reader.cancel().catch(() => {});
        await finish(true);
      },
    }),
    { status: response.status, headers: response.headers },
  );
}
