import { randomUUID } from "node:crypto";
import type { LlmErrorCode } from "@mobility/contracts";

export class ControlError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    readonly status = 400,
    readonly retryAfter?: number,
    readonly incidentId: string = randomUUID(),
  ) {
    super(code);
    this.name = "ControlError";
  }
}
export function controlError(error: unknown) {
  const value =
    error instanceof ControlError
      ? error
      : new ControlError("service_unavailable", 503);
  return Response.json(
    { error: value.code, incidentId: value.incidentId },
    {
      status: value.status,
      headers: {
        "Cache-Control": "no-store",
        ...(value.retryAfter
          ? { "Retry-After": String(value.retryAfter) }
          : {}),
      },
    },
  );
}
export function externallyEnabled(
  kind: "LLM" | "EMAIL",
  env: Record<string, string | undefined> = process.env,
) {
  return (
    env[`MOBAI_${kind}_ENABLED`] === "true" &&
    env.VERCEL_ENV !== "preview" &&
    env.DEPLOYMENT_ENV !== "preview"
  );
}
export async function boundedText(
  request: Request | Response,
  maximum = 32768,
) {
  const reader = request.body?.getReader();
  if (!reader) throw new ControlError("invalid_request");
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maximum) throw new ControlError("invalid_request", 413);
      parts.push(part.value);
    }
    return Buffer.concat(parts).toString("utf8");
  } finally {
    await reader.cancel().catch(() => {});
  }
}
