import {
  type LlmUsage,
  type ModelProfile,
  usageTotals,
} from "@mobility/contracts";
import { ControlError } from "./errors";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function parseProviderUsage(
  value: unknown,
  protocol: ModelProfile["protocol"],
): LlmUsage | null {
  const u = record(value);
  const input = protocol === "responses" ? u.input_tokens : u.prompt_tokens;
  const output =
    protocol === "responses" ? u.output_tokens : u.completion_tokens;
  const cache =
    record(
      protocol === "responses"
        ? u.input_tokens_details
        : u.prompt_tokens_details,
    ).cached_tokens ??
    u.prompt_cache_hit_tokens ??
    null;
  const reasoning =
    record(
      protocol === "responses"
        ? u.output_tokens_details
        : u.completion_tokens_details,
    ).reasoning_tokens ?? null;
  const cost =
    typeof u.cost === "number" && Number.isFinite(u.cost) && u.cost >= 0
      ? Math.ceil(u.cost * 1_000_000)
      : null;
  const result = usageTotals.safeParse({
    inputTokens: input,
    outputTokens: output,
    cachedTokens: cache,
    reasoningTokens: reasoning,
    reportedCostMicros: cost,
  });
  return result.success ? result.data : null;
}
export function normalizeProviderError(status: number, value: unknown) {
  const error = record(record(value).error);
  const code =
    `${String(error.code ?? "")} ${String(error.type ?? "")} ${String(error.message ?? "")}`.toLowerCase();
  if (status === 401) return new ControlError("credential_invalid", 400);
  if (
    status === 402 ||
    /insufficient_quota|credit|balance|billing|spend.limit/.test(code)
  )
    return new ControlError("provider_balance", 402);
  if (status === 403 || status === 404)
    return new ControlError("model_denied", 403);
  if (status === 429) return new ControlError("rate_limited", 429, 60);
  if (/context|too.many.tokens|maximum.*length/.test(code))
    return new ControlError("context_exceeded", 400);
  return new ControlError(
    status >= 500 ? "provider_unavailable" : "model_incompatible",
    status >= 500 ? 502 : 400,
  );
}
export function prepareProviderBody(
  raw: unknown,
  model: ModelProfile,
  outputLimit: number,
) {
  const body = record(raw);
  if (body.stream === undefined) body.stream = false;
  if (
    body.model !== model.modelId ||
    (body.stream !== true && body.stream !== false)
  )
    throw new ControlError("model_incompatible");
  const common = [
    "model",
    "tools",
    "tool_choice",
    "stream",
    "temperature",
    "top_p",
    "stop",
    "seed",
    "parallel_tool_calls",
  ];
  const allowed = new Set(
    model.protocol === "responses"
      ? [
          ...common,
          "input",
          "instructions",
          "max_output_tokens",
          "store",
          "reasoning",
          "include",
          "text",
          "truncation",
          "safety_identifier",
        ]
      : [
          ...common,
          "messages",
          "max_tokens",
          "max_completion_tokens",
          "stream_options",
          "frequency_penalty",
          "presence_penalty",
          "reasoning_effort",
          "thinking",
        ],
  );
  if (
    Object.keys(body).some((key) => !allowed.has(key)) ||
    !Array.isArray(model.protocol === "responses" ? body.input : body.messages)
  )
    throw new ControlError("model_incompatible");
  const parameters = new Set<string>(model.parameters);
  // EVE adds its pseudonymous owner identifier to the OpenAI SDK request.
  // Permit only a bounded value, not arbitrary provider metadata or headers.
  if (
    body.safety_identifier !== undefined &&
    (typeof body.safety_identifier !== "string" ||
      !/^[A-Za-z0-9_:.-]{1,200}$/.test(body.safety_identifier))
  )
    throw new ControlError("model_incompatible");
  for (const key of [
    "temperature",
    "top_p",
    "stop",
    "seed",
    "parallel_tool_calls",
    "frequency_penalty",
    "presence_penalty",
    "reasoning",
    "reasoning_effort",
    "text",
  ])
    if (body[key] !== undefined && !parameters.has(key))
      throw new ControlError("model_incompatible");
  if (
    body.tools !== undefined &&
    (!Array.isArray(body.tools) ||
      body.tools.length > 32 ||
      body.tools.some((tool) => record(tool).type !== "function"))
  )
    throw new ControlError("model_incompatible");
  // Reject oversized context, never trim messages or tool results. This byte guard is deliberately conservative.
  const content = JSON.stringify(
    model.protocol === "responses"
      ? {
          input: body.input,
          instructions: body.instructions,
          tools: body.tools,
        }
      : { messages: body.messages, tools: body.tools },
  );
  if (Buffer.byteLength(content) + outputLimit > model.contextTokens)
    throw new ControlError("context_exceeded");
  if (model.protocol === "responses") {
    body.store = false;
    body.max_output_tokens = outputLimit;
    body.truncation = "disabled";
  } else {
    delete body.max_completion_tokens;
    delete body.max_tokens;
    body[model.outputTokenParameter] = outputLimit;
    if (model.includeUsage && body.stream)
      body.stream_options = { include_usage: true };
    else delete body.stream_options;
    if (model.reasoning === "deepseek") body.thinking = { type: "enabled" };
    else {
      delete body.thinking;
    }
  }
  return body;
}
/** Remove error details before they can enter EVE state, traces or the browser. */
export function safeProviderValue(value: unknown, forbidden?: string): unknown {
  if (typeof value === "string") {
    if (forbidden && value.includes(forbidden))
      throw new ControlError("provider_unavailable", 502);
    return value;
  }
  if (Array.isArray(value))
    return value.map((v) => safeProviderValue(v, forbidden));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !forbidden || !key.includes(forbidden))
        .map(([key, item]) => [
          key,
          key === "error" && item
            ? {
                code: "provider_unavailable",
                message: "provider_unavailable",
                type: "provider_error",
              }
            : safeProviderValue(item, forbidden),
        ]),
    );
  return value;
}
/** Bounded SSE framing, validation and sanitization before forwarding; never raw error bodies. */
export class UsageObserver {
  private readonly decoder = new TextDecoder();
  private pending = "";
  usage: LlmUsage | null = null;
  responseId: string | null = null;
  errorCode: "provider_unavailable" | null = null;
  terminal = false;
  constructor(
    private readonly protocol: ModelProfile["protocol"],
    private readonly forbidden?: string,
  ) {}
  feed(chunk: Uint8Array, done = false): Uint8Array {
    this.pending += this.decoder.decode(chunk, { stream: !done });
    if (this.pending.length > 1_000_000)
      throw new ControlError("provider_unavailable", 502);
    this.pending = this.pending.replace(/\r\n/g, "\n");
    if (done && this.pending.trim()) this.pending += "\n\n";
    let at = this.pending.indexOf("\n\n");
    let output = "";
    while (at >= 0) {
      const frame = this.pending.slice(0, at);
      this.pending = this.pending.slice(at + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data === "[DONE]") {
        if (this.protocol === "chat-completions") this.terminal = true;
        output += "data: [DONE]\n\n";
      } else if (data) {
        let event: Record<string, unknown>;
        try {
          event = record(JSON.parse(data));
        } catch {
          throw new ControlError("provider_unavailable", 502);
        }
        const clean =
          event.type === "error"
            ? {
                type: "error",
                code: "provider_unavailable",
                message: "provider_unavailable",
              }
            : safeProviderValue(event, this.forbidden);
        const safeEvent = record(clean);
        const result =
          this.protocol === "responses"
            ? record(safeEvent.response)
            : safeEvent;
        if (
          ["error", "response.failed"].includes(String(safeEvent.type)) ||
          result.error
        )
          this.errorCode = "provider_unavailable";
        const finalResponse = [
          "response.completed",
          "response.incomplete",
          "response.failed",
        ].includes(String(event.type));
        const choices = Array.isArray(event.choices) ? event.choices : [];
        if (this.protocol === "responses" && finalResponse) {
          this.usage = parseProviderUsage(result.usage, this.protocol);
          this.terminal = true;
        } else if (
          this.protocol === "chat-completions" &&
          event.usage &&
          (choices.length === 0 ||
            choices.some((c) => typeof record(c).finish_reason === "string"))
        ) {
          this.usage = parseProviderUsage(event.usage, this.protocol);
        }
        if (typeof result.id === "string" && result.id.length <= 200)
          this.responseId = result.id;
        const eventName = frame
          .split("\n")
          .find(
            (line) =>
              /^event: [a-zA-Z0-9_.-]+$/.test(line) &&
              (!this.forbidden || !line.includes(this.forbidden)),
          );
        output += `${eventName ? `${eventName}\n` : ""}data: ${JSON.stringify(clean)}\n\n`;
      }
      at = this.pending.indexOf("\n\n");
    }
    return new TextEncoder().encode(output);
  }
}
