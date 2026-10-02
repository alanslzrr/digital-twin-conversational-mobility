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
  system: "Instrucciones del sistema",
  developer: "Instrucciones de la aplicación",
  user: "Tu mensaje",
  assistant: "Respuesta del asistente",
  tool: "Resultado de herramienta",
};
const kinds: Record<string, string> = {
  model_input: "Contenido enviado realmente al modelo",
  model_output: "Respuesta capturada del modelo",
  tool_input: "Argumentos de la consulta",
  tool_output: "Resultado capturado de la consulta",
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
        Contenido no disponible, omitido o caducado. Lo que nunca se capturó no
        se puede recuperar.
      </p>
    );
  const data = parsed.data;
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="text-base font-semibold">{kinds[data.kind]}</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Capturado: <Instant value={data.capturedAt} /> · Incorporado a la traza:{" "}
        <Instant value={data.recordedAt} />.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {number(data.retainedBytes)} de {number(data.originalBytes)} bytes
        retenidos ·{" "}
        {data.redacted
          ? "Contenido saneado con elementos eliminados"
          : "Proyección saneada"}{" "}
        ·{" "}
        {data.truncated
          ? "Truncado: no se dispone del contenido omitido"
          : "Sujeto a los límites de captura"}{" "}
        · Disponible hasta <Instant value={data.expiresAt} />.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Describe la captura del transporte, no demuestra qué información influyó
        semánticamente en la respuesta.
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
                      Contenido omitido por tamaño, tipo no admitido o saneado;
                      no está disponible.
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
                        ? `Consulta a ${tool?.canonicalName ? toolCopy[tool.canonicalName].title : "descubrimiento de herramientas"}`
                        : "Resultado de herramienta incluido en el envío al modelo"}
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
            Herramientas disponibles en este envío, no necesariamente llamadas
          </summary>
          <ul className="mt-3 space-y-2">
            {data.content.functions.map((f) => {
              const tool = resolveTelemetryTool(f.name);
              return (
                <li key={f.name}>
                  {tool?.canonicalName
                    ? toolCopy[tool.canonicalName].title
                    : "Descubrimiento de herramientas"}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
