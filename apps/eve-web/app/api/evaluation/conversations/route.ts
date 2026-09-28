import { conversationCursor, conversationPage } from "@mobility/contracts";
import {
  accessError,
  allowedBrowserRequest,
  coreAccess,
  readIdentity,
} from "../../../../src/evaluator-auth";

export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!allowedBrowserRequest(request)) return accessError(403);
  try {
    const identity = await readIdentity(request);
    if (!identity) return accessError(401);
    const params = new URL(request.url).searchParams;
    if (
      [...params.keys()].some((key) => key !== "cursor") ||
      params.getAll("cursor").length > 1
    )
      return accessError(400);
    let cursor: { createdAt: string; sessionId: string } | undefined;
    const raw = params.get("cursor");
    if (raw !== null) {
      if (raw.length > 512) return accessError(400);
      try {
        cursor = conversationCursor.parse(JSON.parse(raw));
      } catch {
        return accessError(400);
      }
    }
    const result = await coreAccess({
      action: "list_sessions",
      principalId: identity.principalId,
      ...(cursor ? { cursor } : {}),
    });
    if (!result.ok) return accessError(result.status);
    return Response.json(conversationPage.parse(await result.json()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return accessError(503);
  }
}
