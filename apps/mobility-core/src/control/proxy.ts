import { llmId, llmSessionId, turnBinding } from "@mobility/contracts";
import { z } from "zod";
import { evaluateBudget } from "../conversation-budget";
import { database } from "../database";
import { boundedText, ControlError, externallyEnabled } from "./errors";
import { dispatchAttempt, reserveAttempt, settleAttempt } from "./ledger";
import { providerFetch } from "./network";
import { watchRevocation } from "./revocation";
import { secretStore } from "./secrets";
import {
  normalizeProviderError,
  parseProviderUsage,
  prepareProviderBody,
  safeProviderValue,
  UsageObserver,
} from "./usage";

const contextSchema = z
  .object({
    principalId: llmId,
    sessionId: llmSessionId,
    turnId: llmSessionId,
    bindingId: llmId,
    stepIndex: z.coerce.number().int().min(0).max(1_000_000),
    purpose: z.enum(["step", "compaction"]),
  })
  .strict();
export async function proxyInference(
  request: Request,
  protocol: "responses" | "chat-completions",
  network = providerFetch,
) {
  if (!externallyEnabled("LLM"))
    throw new ControlError("feature_disabled", 503);
  const context = contextSchema.parse({
    principalId: request.headers.get("x-mobai-principal"),
    sessionId: request.headers.get("x-mobai-session"),
    turnId: request.headers.get("x-mobai-turn"),
    bindingId: request.headers.get("x-mobai-binding"),
    stepIndex: request.headers.get("x-mobai-step"),
    purpose: request.headers.get("x-mobai-purpose"),
  });
  const [turn] =
    await database()`SELECT binding FROM llm_turn WHERE id=${context.bindingId} AND principal_id=${context.principalId}
    AND session_id=${context.sessionId} AND turn_id=${context.turnId}`;
  if (!turn) throw new ControlError("access_denied", 403);
  const binding = turnBinding.parse(turn.binding);
  if (binding.model.protocol !== protocol)
    throw new ControlError("model_incompatible");
  const body = prepareProviderBody(
    JSON.parse(await boundedText(request, 512_000)),
    binding.model,
    binding.outputLimit,
  );
  const serialized = JSON.stringify(body);
  const configured = process.env.MOBILITY_BUDGET_MODE || "interactive";
  const requested = request.headers.get("x-mobai-budget-mode") || "interactive";
  if (
    ![configured, requested].every(
      (mode) => mode === "interactive" || mode === "campaign",
    )
  )
    throw new ControlError("invalid_request");
  const campaign = configured === "campaign" || requested === "campaign";
  const grant = await reserveAttempt(context, serialized);
  let campaignStarted = false,
    campaignDispatched = false;
  let deadline = grant.deadline;
  const started = performance.now();
  let finalized = false;
  let revocation: ReturnType<typeof watchRevocation> | undefined;
  const finish = async (
    usage: ReturnType<typeof parseProviderUsage>,
    responseId: string | null,
    error: string | null,
  ) => {
    if (finalized) return;
    revocation?.close();
    await settleAttempt(
      grant.id,
      binding,
      usage,
      responseId,
      error,
      performance.now() - started,
    );
    if (campaignStarted) {
      const result = await evaluateBudget({
        action: "budget_finish",
        principalId: binding.principalId,
        sessionId: binding.sessionId,
        attemptId: grant.id,
        notSent: !campaignDispatched,
        usage:
          campaignDispatched && usage
            ? {
                input: usage.inputTokens,
                output: usage.outputTokens,
                cached: usage.cachedTokens,
              }
            : null,
      });
      if (result.status !== 200)
        throw new ControlError("budget_exhausted", 429);
    }
    finalized = true;
  };
  try {
    if (campaign) {
      const admission = await evaluateBudget({
        action: "budget_begin",
        inputKind: "upper_bound",
        principalId: binding.principalId,
        sessionId: binding.sessionId,
        turnId: binding.turnId,
        stepIndex: Math.min(context.stepIndex, 7),
        purpose: context.purpose,
        attemptId: grant.id,
      });
      if (
        admission.status !== 200 ||
        !("inputLimit" in admission.body) ||
        typeof admission.body.inputLimit !== "number" ||
        typeof admission.body.outputLimit !== "number" ||
        typeof admission.body.deadline !== "string"
      )
        throw new ControlError("budget_exhausted", 429);
      campaignStarted = true;
      // Conservative bound, not a fabricated exact token count or another provider call.
      if (
        binding.model.contextTokens > admission.body.inputLimit ||
        binding.outputLimit > admission.body.outputLimit
      )
        throw new ControlError("budget_exhausted", 429);
      deadline = Math.min(deadline, Date.parse(admission.body.deadline));
    }
    const secret = await secretStore.read(
      grant.secretId,
      `credential:${binding.credentialId}:${binding.credentialVersion}`,
    );
    revocation = watchRevocation(binding, deadline, request.signal);
    const signal = AbortSignal.any([
      request.signal,
      revocation.signal,
      AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    ]);
    if (signal.aborted) throw new ControlError("operation_conflict", 409);
    if (campaign) {
      const admission = await evaluateBudget({
        action: "budget_dispatch",
        inputKind: "upper_bound",
        principalId: binding.principalId,
        sessionId: binding.sessionId,
        attemptId: grant.id,
        inputTokens: binding.model.contextTokens,
      });
      if (admission.status !== 200)
        throw new ControlError("budget_exhausted", 429);
      campaignDispatched = true;
    }
    await dispatchAttempt(grant.id, binding);
    const response = await network(
      `${grant.provider.baseUrl.replace(/\/$/, "")}/${protocol === "responses" ? "responses" : "chat/completions"}`,
      {
        method: "POST",
        body: serialized,
        signal,
        headers: {
          "Content-Type": "application/json",
          ...(grant.provider.authentication === "api-key"
            ? { "api-key": secret }
            : { Authorization: `Bearer ${secret}` }),
        },
      },
    );
    if (!response.ok) {
      let value: unknown = null;
      try {
        value = JSON.parse(await boundedText(response, 16_384));
      } catch {
        /* Safe generic error below. */
      }
      const error = normalizeProviderError(response.status, value);
      const header = response.headers.get("retry-after");
      const after = header
        ? /^\d+$/.test(header)
          ? Number(header)
          : Math.ceil((Date.parse(header) - Date.now()) / 1000)
        : 60;
      await finish(null, null, error.code);
      throw new ControlError(
        error.code,
        error.status,
        error.code === "rate_limited"
          ? Math.min(604800, Math.max(1, Number.isFinite(after) ? after : 60))
          : undefined,
      );
    }
    if (!body.stream) {
      const text = await boundedText(response, 2_000_000);
      const result = JSON.parse(text);
      const safe = safeProviderValue(result, secret);
      await finish(
        parseProviderUsage(result.usage, protocol),
        typeof result.id === "string" ? result.id.slice(0, 200) : null,
        null,
      );
      return new Response(JSON.stringify(safe), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "x-mobai-attempt": grant.id,
        },
      });
    }
    if (
      !response.headers.get("content-type")?.includes("text/event-stream") ||
      !response.body
    )
      throw new ControlError("model_incompatible", 502);
    const reader = response.body.getReader();
    const observer = new UsageObserver(protocol, secret);
    let size = 0;
    return new Response(
      new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            // A transport chunk need not complete an SSE frame. Keep reading
            // until we can satisfy the pending consumer read, rather than
            // returning an empty pull and stalling the stream.
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) {
                const tail = observer.feed(new Uint8Array(), true);
                if (tail.length) controller.enqueue(tail);
                await finish(
                  observer.terminal ? observer.usage : null,
                  observer.responseId,
                  observer.errorCode ??
                    (observer.terminal ? null : "execution_uncertain"),
                );
                controller.close();
                return;
              }
              size += chunk.value.byteLength;
              if (size > 8_000_000)
                throw new ControlError("provider_unavailable", 502);
              const safe = observer.feed(chunk.value);
              if (safe.length) controller.enqueue(safe);
              if (safe.length) return;
            }
          } catch {
            await reader.cancel().catch(() => {});
            await finish(
              null,
              observer.responseId,
              "execution_uncertain",
            ).catch(() => {});
            controller.error(new Error("execution_uncertain"));
          }
        },
        async cancel() {
          await reader.cancel().catch(() => {});
          await finish(null, observer.responseId, "execution_uncertain").catch(
            () => {},
          );
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
          "x-mobai-attempt": grant.id,
        },
      },
    );
  } catch (error) {
    await finish(
      null,
      null,
      error instanceof ControlError ? error.code : "provider_unavailable",
    ).catch(() => {});
    throw error instanceof ControlError
      ? new ControlError(error.code, error.status, error.retryAfter, grant.id)
      : new ControlError("provider_unavailable", 502, undefined, grant.id);
  }
}
