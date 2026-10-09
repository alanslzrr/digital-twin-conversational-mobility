import { z } from "zod";

export const accountRole = z.enum(["admin", "evaluator"]);
export const llmProtocol = z.enum(["chat-completions", "responses"]);
export const llmId = z.uuid();
export const llmSessionId = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const label = z.string().trim().min(1).max(100);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime({ offset: true });

export const providerProfileInput = z
  .object({
    name: label,
    baseUrl: z.url().max(500),
    protocols: z.array(llmProtocol).min(1).max(2),
    authentication: z.enum(["bearer", "api-key"]).default("bearer"),
    modelList: z.boolean().default(true),
  })
  .strict();
export const modelProfileInput = z
  .object({
    providerId: llmId,
    modelId: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9_.:/@+-]+$/),
    name: label,
    protocol: llmProtocol,
    contextTokens: z.number().int().min(1024).max(2_000_000),
    maxOutputTokens: z.number().int().min(1).max(100_000),
    tools: z.boolean(),
    streaming: z.boolean(),
    ready: z.boolean().default(false),
    includeUsage: z.boolean().default(true),
    reasoning: z.enum(["none", "deepseek"]).default("none"),
    outputTokenParameter: z
      .enum(["max_tokens", "max_completion_tokens"])
      .default("max_tokens"),
    parameters: z
      .array(
        z.enum([
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
        ]),
      )
      .max(10)
      .default([]),
    inputMicrosPerMillion: integer.nullable().default(null),
    outputMicrosPerMillion: integer.nullable().default(null),
    cacheMicrosPerMillion: integer.nullable().default(null),
    pricesValidUntil: timestamp.nullable().default(null),
  })
  .strict()
  .refine(
    (m) =>
      m.maxOutputTokens < m.contextTokens &&
      (m.cacheMicrosPerMillion === null ||
        (m.inputMicrosPerMillion !== null &&
          m.cacheMicrosPerMillion <= m.inputMicrosPerMillion)) &&
      (m.pricesValidUntil === null ||
        (m.inputMicrosPerMillion !== null &&
          m.outputMicrosPerMillion !== null)),
  );

export const controlSettings = z
  .object({
    capacity: z.number().int().min(1).max(500),
    globalConcurrency: z.number().int().min(1).max(30),
    userConcurrency: z.number().int().min(1).max(5),
    requestsPerMinute: z.number().int().min(1).max(60),
    requestsPerDay: z.number().int().min(1).max(1000),
    inputTokensPerSession: z.number().int().min(1024).max(1_000_000),
    outputTokensPerSession: z.number().int().min(256).max(100_000),
    outputTokensPerCall: z.number().int().min(128).max(32_000),
  })
  .strict();
export const usageTotals = z
  .object({
    inputTokens: integer,
    outputTokens: integer,
    cachedTokens: integer.nullable(),
    reasoningTokens: integer.nullable(),
    reportedCostMicros: integer.nullable(),
  })
  .strict()
  .refine(
    (u) =>
      (u.cachedTokens === null || u.cachedTokens <= u.inputTokens) &&
      (u.reasoningTokens === null || u.reasoningTokens <= u.outputTokens),
  );
export type LlmUsage = z.infer<typeof usageTotals>;
export type ModelProfile = z.infer<typeof modelProfileInput> & {
  id: string;
  enabled: boolean;
  version: number;
};
export type ProviderProfile = z.infer<typeof providerProfileInput> & {
  id: string;
  enabled: boolean;
};

export const credentialMetadata = z.object({
  id: llmId,
  providerId: llmId,
  ownerId: llmId,
  alias: label,
  origin: z.enum(["user", "admin"]),
  version: z.number().int().positive(),
  fingerprint: z.string().max(20),
  enabled: z.boolean(),
  deleted: z.boolean(),
  createdAt: timestamp,
});
export const fundingGrantInput = z
  .object({
    userId: llmId,
    poolId: llmId,
    modelIds: z.array(llmId).min(1).max(100),
    budgetMicros: integer.positive(),
    expiresAt: timestamp,
    inputTokenLimit: z.number().int().min(1).max(100_000_000),
    outputTokenLimit: z.number().int().min(1).max(100_000_000),
    callLimit: z.number().int().min(1).max(100_000),
    concurrencyLimit: z.number().int().min(1).max(5).default(1),
  })
  .strict();
export const selectionInput = z
  .object({
    modelId: llmId,
    credentialId: llmId.optional(),
    grantId: llmId.optional(),
    sessionId: llmSessionId.optional(),
    confirmProviderChange: z.boolean().default(false),
  })
  .strict()
  .refine((v) => Boolean(v.credentialId) !== Boolean(v.grantId));
export const controlAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("snapshot"),
      admin: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      action: z.literal("reauth"),
      password: z.string().min(12).max(128),
      code: z.string().regex(/^\d{6}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("user.invite"),
      email: z.email().max(254),
      name: label,
    })
    .strict(),
  z
    .object({
      action: z.literal("user.update"),
      id: llmId,
      role: accountRole,
      enabled: z.boolean(),
      expiresAt: timestamp,
    })
    .strict(),
  z.object({ action: z.literal("user.recover"), id: llmId }).strict(),
  z
    .object({ action: z.literal("settings.update"), settings: controlSettings })
    .strict(),
  z
    .object({
      action: z.literal("provider.create"),
      provider: providerProfileInput,
    })
    .strict(),
  z
    .object({
      action: z.literal("provider.toggle"),
      id: llmId,
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({ action: z.literal("model.create"), model: modelProfileInput })
    .strict(),
  z
    .object({
      action: z.literal("model.toggle"),
      id: llmId,
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({ action: z.literal("models.discover"), credentialId: llmId })
    .strict(),
  z
    .object({
      action: z.literal("credential.create"),
      providerId: llmId,
      ownerId: llmId.optional(),
      alias: label,
      secret: z
        .string()
        .trim()
        .min(8)
        .max(4096)
        .regex(/^[\x21-\x7e]+$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("credential.replace"),
      id: llmId,
      secret: z
        .string()
        .trim()
        .min(8)
        .max(4096)
        .regex(/^[\x21-\x7e]+$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("credential.toggle"),
      id: llmId,
      enabled: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal("credential.delete"), id: llmId }).strict(),
  z
    .object({
      action: z.literal("pool.create"),
      credentialId: llmId,
      name: label,
      budgetMicros: integer.positive(),
      expiresAt: timestamp,
    })
    .strict(),
  z
    .object({
      action: z.literal("pool.update"),
      id: llmId,
      budgetMicros: integer.positive(),
      expiresAt: timestamp,
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({ action: z.literal("grant.create"), grant: fundingGrantInput })
    .strict(),
  z
    .object({
      action: z.literal("grant.update"),
      id: llmId,
      grant: fundingGrantInput,
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("selection.prepare"),
      selection: selectionInput,
    })
    .strict(),
  z
    .object({ action: z.literal("selection.current"), sessionId: llmSessionId })
    .strict(),
  z
    .object({
      action: z.literal("attempt.reconcile"),
      id: llmId,
      costMicros: integer,
      note: z.string().trim().min(10).max(300),
    })
    .strict(),
  z.object({ action: z.literal("mail.retry"), id: llmId }).strict(),
]);
export type ControlAction = z.infer<typeof controlAction>;

export const runtimeLlmAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("session.register"),
      principalId: llmId,
      selectionId: llmId,
      sessionId: llmSessionId,
    })
    .strict(),
  z
    .object({
      action: z.literal("selection.validate"),
      principalId: llmId,
      selectionId: llmId,
      sessionId: llmSessionId.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("turn.bind"),
      principalId: llmId,
      selectionId: llmId,
      sessionId: llmSessionId,
      turnId: llmSessionId,
    })
    .strict(),
  z
    .object({
      action: z.literal("turn.finish"),
      principalId: llmId,
      sessionId: llmSessionId,
      turnId: llmSessionId,
      status: z.enum(["completed", "failed", "cancelled", "waiting"]),
    })
    .strict(),
]);
export type RuntimeLlmAction = z.infer<typeof runtimeLlmAction>;
export const turnBinding = z.object({
  id: llmId,
  principalId: llmId,
  sessionId: llmSessionId,
  turnId: llmSessionId,
  providerId: llmId,
  providerName: label,
  model: modelProfileInput.safeExtend({
    id: llmId,
    version: z.number().int().positive(),
    enabled: z.boolean(),
  }),
  credentialId: llmId,
  credentialVersion: z.number().int().positive(),
  grantId: llmId.nullable(),
  outputLimit: z.number().int().positive(),
  policyVersion: z.number().int().positive(),
  policy: controlSettings,
});
export type TurnBinding = z.infer<typeof turnBinding>;
export const llmErrorCode = z.enum([
  "authentication_required",
  "access_denied",
  "mfa_required",
  "reauth_required",
  "capacity_reached",
  "last_admin",
  "invalid_request",
  "not_found",
  "service_unavailable",
  "feature_disabled",
  "credential_invalid",
  "credential_disabled",
  "model_denied",
  "provider_disabled",
  "provider_consent_required",
  "funding_expired",
  "budget_exhausted",
  "provider_balance",
  "rate_limited",
  "context_exceeded",
  "model_incompatible",
  "provider_unavailable",
  "execution_uncertain",
  "operation_conflict",
  "turn_active",
  "prices_unverified",
  "mail_limited",
  "mail_unavailable",
]);
export type LlmErrorCode = z.infer<typeof llmErrorCode>;
export type ControlSnapshot = {
  preference: {
    modelId: string;
    credentialId?: string;
    grantId?: string;
  } | null;
  identity: {
    id: string;
    label: string;
    email: string;
    role: "admin" | "evaluator";
    mfa: boolean;
    twoFactorEnabled: boolean;
    reauthenticated: boolean;
  };
  settings: z.infer<typeof controlSettings>;
  providers: ProviderProfile[];
  models: ModelProfile[];
  credentials: z.infer<typeof credentialMetadata>[];
  grants: Array<
    z.infer<typeof fundingGrantInput> & {
      id: string;
      enabled: boolean;
      usedMicros: number;
      reservedMicros: number;
      calls: number;
      availableMicros: number;
      budgetWarning: boolean;
      status: "active" | "suspended" | "expired" | "exhausted";
    }
  >;
  pools: Array<{
    id: string;
    name: string;
    credentialId: string;
    budgetMicros: number;
    expiresAt: string;
    enabled: boolean;
    usedMicros: number;
    reservedMicros: number;
  }>;
  users: Array<{
    id: string;
    label: string;
    email: string;
    role: "admin" | "evaluator";
    enabled: boolean;
    expiresAt: string;
    state: "active" | "pending";
  }>;
  attempts: Array<{
    id: string;
    userId: string;
    sessionId: string;
    turnId: string;
    modelId: string;
    providerId: string;
    grantId: string | null;
    purpose: string;
    state: string;
    reservedMicros: number;
    costMicros: number | null;
    costSource: string;
    usage: LlmUsage | null;
    errorCode: string | null;
    createdAt: string;
    durationMs: number | null;
  }>;
  mail: Array<{
    id: string;
    userId: string;
    state: string;
    attempts: number;
    createdAt: string;
  }>;
  audit: Array<{
    id: string;
    actorId: string | null;
    action: string;
    targetId: string | null;
    createdAt: string;
    details: Record<string, unknown>;
  }>;
  consumption: Array<{
    userId: string;
    providerId: string;
    modelId: string;
    usedMicros: number;
    reservedMicros: number;
    inputTokens: number;
    outputTokens: number;
    calls: number;
  }>;
  totals: {
    usedMicros: number;
    reservedMicros: number;
    inputTokens: number;
    outputTokens: number;
    unknownAttempts: number;
    calls: number;
  };
};
