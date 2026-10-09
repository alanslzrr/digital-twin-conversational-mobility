import { llmId } from "@mobility/contracts";
import { runtimeControl } from "./control-client";
import { readIdentity } from "./evaluator-auth";

/** onMessage is not called by EVE for inputResponses. Bind trusted attributes in authentication too. */
export async function evaluationCaller(request: Request) {
  const identity = await readIdentity(request);
  if (!identity) return null;
  const attributes: Record<string, string> = {};
  const path = new URL(request.url).pathname;
  const generating =
    request.method === "POST" &&
    (/\/session$/.test(path) || /\/session\/[^/]+$/.test(path));
  const header = request.headers.get("x-mobai-selection");
  if (generating && header) {
    const selectionId = llmId.parse(header);
    const encoded = /\/session\/([^/]+)$/.exec(path)?.[1];
    await runtimeControl({
      action: "selection.validate",
      principalId: identity.principalId,
      selectionId,
      ...(encoded ? { sessionId: decodeURIComponent(encoded) } : {}),
    });
    attributes.mobaiSelectionId = selectionId;
  }
  return {
    authenticator: "evaluator-password",
    attributes,
    issuer: "mobility-evaluation",
    principalId: identity.principalId,
    principalType: "user" as const,
  };
}
