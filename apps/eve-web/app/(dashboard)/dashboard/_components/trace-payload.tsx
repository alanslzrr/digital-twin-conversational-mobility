"use client";
import {
  dashboardTracePayload,
  resolveTelemetryTool,
} from "@mobility/contracts";
import { number } from "./insights";
import { InspectionResult } from "./inspection-result";
import { Instant, Technical } from "./shared";
import { toolCopy } from "./tool-form";

const roles: Record<string, string> = {
  system: "System instructions",
  developer: "Application instructions",
  user: "Tu mensaje",
  assistant: "Assistant response",
  tool: "Tool result",
};
const kinds: Record<string, string> = {
  model_input: "Content enviado realmente al modelo",
  model_output: "Captured model response",
  tool_input: "Query arguments",
  tool_output: "Captured query result",
};
function keyed<T>(values: T[]) {
  const duplicates = new Map<number, number>();
  return values.map((value) => {
    let hash = 2166136261;
    for (const char of JSON.stringify(value))
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const occurrence = duplicates.get(hash) ?? 0;
    duplicates.set(hash, occurrence + 1);
    return { value, key: `${hash}:${occurrence}` };
  });
}
export function TracePayload({ value }: { value: unknown }) {
  const parsed = dashboardTracePayload.safeParse(value);
  if (!parsed.success)
    return (
      <p role="status" className="text-sm">
        Content unavailable, omitted or expired. Uncaptured content cannot be
        recovered.
      </p>
    );
  const data = parsed.data;
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="text-base font-semibold">{kinds[data.kind]}</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Captured: <Instant value={data.capturedAt} /> · Trace ingestion:{" "}
        <Instant value={data.recordedAt} />.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {number(data.retainedBytes)} de {number(data.originalBytes)} bytes
        retenidos ·{" "}
        {data.redacted
          ? "Content saneado con elementos eliminados"
          : "Sanitized projection"}{" "}
        ·{" "}
        {data.truncated
          ? "Truncated: omitted content unavailable"
          : "Subject to capture limits"}{" "}
        · Disponible hasta <Instant value={data.expiresAt} />.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Describes transport capture, not semantic influence on the response.
      </p>
      <div className="mt-4 divide-y">
        {keyed(data.content.messages).map(
          ({ value: message, key: messageKey }) => (
            <section key={messageKey} className="py-4">
              <h3 className="text-sm font-semibold">{roles[message.role]}</h3>
              {keyed(message.parts).map(({ value: part, key: partKey }) => {
                if (part.type === "text") {
                  let structured: unknown;
                  try {
                    structured = JSON.parse(part.text);
                  } catch {}
                  return structured && typeof structured === "object" ? (
                    <InspectionResult
                      key={partKey}
                      value={{
                        result: structured,
                        executionMode: "captured_transport",
                        evaluatedAt: data.capturedAt,
                      }}
                    />
                  ) : (
                    <p
                      key={partKey}
                      className="mt-2 whitespace-pre-wrap break-words text-sm leading-6"
                    >
                      {part.text}
                    </p>
                  );
                }
                if (part.type === "omitted")
                  return (
                    <p key={partKey} className="mt-2 text-sm">
                      Content omitted by size, unsupported type or sanitization;
                      unavailable.
                    </p>
                  );
                const tool =
                  part.type === "function_call"
                    ? resolveTelemetryTool(part.name)
                    : null;
                return (
                  <div key={partKey} className="mt-3 text-sm">
                    <p>
                      {part.type === "function_call"
                        ? `Call to ${tool?.canonicalName ? toolCopy[tool.canonicalName].title : "tool discovery"}`
                        : "Tool result included in model transport"}
                    </p>
                    <Technical value={part} />
                  </div>
                );
              })}
            </section>
          ),
        )}
      </div>
      {data.content.functions.length ? (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer">
            Tools available in this dispatch, not necessarily called
          </summary>
          <ul className="mt-3 space-y-2">
            {data.content.functions.map((f) => {
              const tool = resolveTelemetryTool(f.name);
              return (
                <li key={f.name}>
                  {tool?.canonicalName
                    ? toolCopy[tool.canonicalName].title
                    : "Tool discovery"}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
