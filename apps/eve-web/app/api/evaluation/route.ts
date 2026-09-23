import {
  accessError,
  allowedBrowserRequest,
  readIdentity,
} from "../../../src/evaluator-auth";

export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!allowedBrowserRequest(request)) return accessError(403);
  try {
    const identity = await readIdentity(request);
    return identity
      ? Response.json(identity, { headers: { "Cache-Control": "no-store" } })
      : accessError(401);
  } catch {
    return accessError(503);
  }
}
