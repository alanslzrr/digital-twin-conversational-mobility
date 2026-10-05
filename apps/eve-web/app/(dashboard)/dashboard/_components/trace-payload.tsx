"use client";

import {
  dashboardTracePayload,
  resolveTelemetryTool,
} from "@mobility/contracts";
import { useUi } from "@/i18n/provider";
import { number } from "./insights";
import { InspectionResult } from "./inspection-result";
import { RefinedDisclosure } from "./refinement/RefinedDisclosure";
import { Instant, Technical } from "./shared";
import { toolCopy } from "./tool-form";

const roles: Record<string, string> = {
  system: "System instructions",
  developer: "Application instructions",
  user: "Your message",
  assistant: "Assistant response",
  tool: "Tool result",
};
const kinds: Record<string, string> = {
  model_input: "Content sent to the model",
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
  const { t, copy, numberLocale } = useUi();

  const parsed = dashboardTracePayload.safeParse(value);
  if (!parsed.success)
    return (
      <p role="status" className="text-sm">
        {t(
          "tracePayload.contentUnavailableOmittedOrExpiredUncapturedContentCannotBe",
        )}
      </p>
    );
  const data = parsed.data;
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="text-base font-semibold">{kinds[data.kind]}</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("tracePayload.captured")}
        <Instant value={data.capturedAt} /> {t("tracePayload.traceIngestion")}{" "}
        <Instant value={data.recordedAt} />.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {number(data.retainedBytes, numberLocale)} {t("commonFragments.of")}{" "}
        {number(data.originalBytes, numberLocale)}{" "}
        {t("tracePayload.retainedBytes")}{" "}
        {data.redacted
          ? t("tracePayload.sanitizedContentWithRemovals")
          : t("tracePayload.sanitizedProjection")}{" "}
        ·{" "}
        {data.truncated
          ? t("tracePayload.truncatedOmittedContentUnavailable")
          : t("tracePayload.subjectToCaptureLimits")}{" "}
        {t("tracePayload.availableUntil")}
        <Instant value={data.expiresAt} />.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {t(
          "tracePayload.describesTransportCaptureNotSemanticInfluenceOnTheResponse",
        )}
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
                      {t(
                        "tracePayload.contentOmittedBySizeUnsupportedTypeOrSanitizationUnavailable",
                      )}
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
                        ? t("presentation.callTo", {
                            name: tool?.canonicalName
                              ? copy(toolCopy[tool.canonicalName].title)
                              : t("tracePayload.toolDiscovery"),
                          })
                        : t("tracePayload.toolResultIncludedInModelTransport")}
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
        <RefinedDisclosure
          title={t(
            "tracePayload.toolsAvailableInThisDispatchNotNecessarilyCalled",
          )}
        >
          <ul className="mt-3 space-y-2">
            {data.content.functions.map((f) => {
              const tool = resolveTelemetryTool(f.name);
              return (
                <li key={f.name}>
                  {tool?.canonicalName
                    ? copy(toolCopy[tool.canonicalName].title)
                    : t("conversationView.toolDiscovery")}
                </li>
              );
            })}
          </ul>
        </RefinedDisclosure>
      ) : null}
    </section>
  );
}
