import { randomUUID } from "node:crypto";
import {
  redactText,
  safeProjection,
  type TelemetryPayload,
  telemetryPayload,
  telemetryToolName,
} from "@mobility/contracts";
export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function projectPayload(
  value: unknown,
  kind: TelemetryPayload["kind"],
): TelemetryPayload {
  const source = record(value);
  const messages: TelemetryPayload["content"]["messages"] = [];
  let redacted = false,
    truncated = false;
  const text = (v: unknown, max: number) => {
    if (typeof v !== "string") return "";
    const safe = redactText(v);
    redacted ||= safe !== v;
    truncated ||= safe.length > max;
    return safe.slice(0, max);
  };
  const items = Array.isArray(source.input)
    ? source.input
    : Array.isArray(source.output)
      ? source.output
      : [];
  if (typeof source.instructions === "string")
    messages.push({
      role: "developer",
      parts: [{ type: "text", text: text(source.instructions, 512000) }],
    });
  if (typeof source.input === "string")
    messages.push({
      role: "user",
      parts: [{ type: "text", text: text(source.input, 512000) }],
    });
  for (const item of items.slice(0, 512)) {
    const i = record(item);
    if (i.type === "reasoning") {
      redacted = true;
      continue;
    }
    if (
      i.type === "function_call" &&
      telemetryToolName.safeParse(i.name).success &&
      typeof i.call_id === "string"
    ) {
      messages.push({
        role: "assistant",
        parts: [
          {
            type: "function_call",
            name: telemetryToolName.parse(i.name),
            callId: i.call_id,
            arguments: text(i.arguments, 8192),
          },
        ],
      });
    } else if (
      i.type === "function_call_output" &&
      typeof i.call_id === "string"
    ) {
      let output: unknown = i.output;
      if (typeof output === "string") {
        try {
          output = JSON.parse(output);
        } catch {}
      }
      const safe = safeProjection(output, 32000);
      redacted ||= safe.redacted;
      truncated ||= safe.truncated;
      messages.push({
        role: "tool",
        parts: [
          {
            type: "function_call_output",
            callId: i.call_id,
            output:
              typeof safe.data === "string"
                ? safe.data
                : JSON.stringify(safe.data),
          },
        ],
      });
    } else if (
      ["system", "developer", "user", "assistant"].includes(String(i.role))
    ) {
      const parts: TelemetryPayload["content"]["messages"][number]["parts"] =
        [];
      if (typeof i.content === "string")
        parts.push({ type: "text", text: text(i.content, 512000) });
      else if (Array.isArray(i.content))
        for (const part of i.content.slice(0, 256)) {
          const p = record(part);
          if (
            ["input_text", "output_text", "text"].includes(String(p.type)) &&
            typeof p.text === "string"
          )
            parts.push({ type: "text", text: text(p.text, 512000) });
          else {
            parts.push({ type: "omitted", reason: "unsupported" });
            redacted = true;
          }
        }
      messages.push({ role: i.role as "user", parts });
    } else redacted = true;
  }
  if (kind === "tool_input" || kind === "tool_output") {
    const safe = safeProjection(
      value,
      kind === "tool_input" ? 8192 : 32000,
      kind === "tool_input" ? Object.keys(source) : [],
    );
    messages.push({
      role: kind === "tool_input" ? "assistant" : "tool",
      parts: [{ type: "text", text: JSON.stringify(safe.data) }],
    });
    redacted ||= safe.redacted;
    truncated ||= safe.truncated;
  }
  const functions: TelemetryPayload["content"]["functions"] = [];
  if (Array.isArray(source.tools))
    for (const raw of source.tools.slice(0, 17)) {
      const t = record(raw);
      if (
        t.type !== "function" ||
        !telemetryToolName.safeParse(t.name).success
      ) {
        redacted = true;
        continue;
      }
      // Effective schemas are supplied by the fixed project tool definitions. Reject
      // credential/opaque fields even if unexpectedly added to the wire schema.
      const schemaKeys = [
        "$schema",
        "type",
        "properties",
        "required",
        "items",
        "additionalProperties",
        "enum",
        "anyOf",
        "oneOf",
        "allOf",
        "description",
        "default",
        "minimum",
        "maximum",
        "minLength",
        "maxLength",
        "minItems",
        "maxItems",
        "format",
        "pattern",
        "$defs",
        "$ref",
      ];
      const parameterNames = Object.keys(
        record(record(t.parameters).properties),
      );
      const safe = safeProjection(t.parameters, 32000, [
        ...schemaKeys,
        ...parameterNames,
      ]);
      redacted ||= safe.redacted;
      truncated ||= safe.truncated;
      functions.push({
        name: telemetryToolName.parse(t.name),
        description: text(t.description, 8192),
        parametersJson: JSON.stringify(safe.data),
      });
    }
  const max =
    kind === "model_input"
      ? 512000
      : kind === "model_output"
        ? 64000
        : kind === "tool_input"
          ? 8192
          : 32000;
  const content = { messages, functions };
  const originalBytes = Buffer.byteLength(JSON.stringify(content));
  while (
    Buffer.byteLength(JSON.stringify(content)) > max &&
    (messages.length || functions.length)
  ) {
    truncated = true;
    if (messages.length) messages.pop();
    else functions.pop();
  }
  const retainedBytes = Buffer.byteLength(JSON.stringify(content));
  return telemetryPayload.parse({
    schemaVersion: 1,
    id: randomUUID(),
    kind,
    capturedAt: new Date().toISOString(),
    originalBytes: Math.max(originalBytes, retainedBytes),
    retainedBytes,
    redacted,
    truncated,
    captureStatus: truncated ? "partial" : "captured",
    reason: truncated ? "size_limit" : null,
    content,
  });
}
