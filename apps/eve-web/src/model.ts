import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { llmErrorCode, llmId, type TurnBinding } from "@mobility/contracts";
import { APICallError, wrapLanguageModel } from "ai";
import { currentBudgetContext } from "./budget-context";
import { coreControlUrl } from "./control-client";
import { providerHistory } from "./model-history";
import { observeModelResponse } from "./model-telemetry";

export function coreModelFetch(
  binding: TurnBinding,
  network: typeof fetch = globalThis.fetch,
): typeof fetch {
  return async (url, init) => {
    const path =
      binding.model.protocol === "responses" ? "responses" : "chat/completions";
    const target = coreControlUrl(`/internal/llm/v1/${path}`);
    if (
      String(url) !== target.toString() ||
      init?.method !== "POST" ||
      typeof init.body !== "string"
    )
      throw new Error("model_incompatible");
    const context = currentBudgetContext();
    if (
      context.principalId !== binding.principalId ||
      context.sessionId !== binding.sessionId ||
      context.turnId !== binding.turnId
    )
      throw new Error("access_denied");
    const token = process.env.MOBILITY_MCP_TOKEN;
    if (!token) throw new Error("service_unavailable");
    const mode = process.env.MOBILITY_BUDGET_MODE || "interactive";
    if (mode !== "interactive" && mode !== "campaign")
      throw new Error("Invalid MOBILITY_BUDGET_MODE");
    const started = performance.now();
    const response = await network(target, {
      method: "POST",
      body: init.body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any([
        AbortSignal.timeout(65_000),
        ...(init.signal ? [init.signal] : []),
      ]),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-mobai-principal": binding.principalId,
        "x-mobai-session": binding.sessionId,
        "x-mobai-turn": binding.turnId,
        "x-mobai-budget-mode": mode,
        "x-mobai-binding": binding.id,
        "x-mobai-step": String(context.stepIndex),
        "x-mobai-purpose": context.purpose,
      },
    }).catch(() => {
      throw new APICallError({
        message: "execution_uncertain",
        url: target.toString(),
        requestBodyValues: {},
        isRetryable: false,
      });
    });
    if (!response.ok) {
      let code = "provider_unavailable";
      let incidentId: string | undefined;
      try {
        const error = await response.json();
        const parsed = llmErrorCode.safeParse(error.error);
        if (parsed.success) code = parsed.data;
        const incident = llmId.safeParse(error.incidentId);
        if (incident.success) incidentId = incident.data;
      } catch {
        /* No raw upstream error material. */
      }
      throw new APICallError({
        message: incidentId ? `${code} · ${incidentId}` : code,
        url: target.toString(),
        requestBodyValues: {},
        statusCode: response.status,
        isRetryable: false,
      });
    }
    return observeModelResponse(
      binding,
      context,
      JSON.parse(init.body),
      response,
      started,
    );
  };
}
// A concrete SDK model, never a bare gateway ID or an external key in Workflow state.
export function createEvaluationModel(
  binding: TurnBinding,
  network?: typeof fetch,
) {
  const baseURL = coreControlUrl("/internal/llm/v1").toString();
  const transport = coreModelFetch(binding, network);
  const model =
    binding.model.protocol === "responses"
      ? createOpenAI({
          apiKey: "internal-transport-only",
          baseURL,
          fetch: transport,
        }).responses(binding.model.modelId)
      : createOpenAICompatible({
          name: `mobai-${binding.providerId}`,
          baseURL,
          fetch: transport,
          includeUsage: binding.model.includeUsage,
        }).chatModel(binding.model.modelId);
  return wrapLanguageModel({
    model,
    middleware: providerHistory(
      `${binding.providerId}:${binding.model.protocol}:${binding.model.modelId}`,
    ),
  });
}
