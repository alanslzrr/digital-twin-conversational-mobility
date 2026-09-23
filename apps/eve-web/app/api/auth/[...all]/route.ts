import {
  accessError,
  allowedBrowserRequest,
  readBoundedJson,
} from "../../../../src/evaluator-auth";

export const runtime = "nodejs";
const allowed = new Set([
  "sign-in/email",
  "sign-out",
  "get-session",
  "change-password",
]);
async function handler(
  request: Request,
  context: { params: Promise<{ all: string[] }> },
) {
  const path = (await context.params).all.join("/");
  if (!allowed.has(path)) return accessError(404);
  if (!allowedBrowserRequest(request)) return accessError(403);
  try {
    const base = process.env.MOBILITY_MCP_URL;
    const token = process.env.MOBILITY_MCP_TOKEN;
    if (!base || !token) return accessError(503);
    const url = new URL(`/api/auth/${path}`, base);
    if (
      url.protocol !== "https:" &&
      !["127.0.0.1", "localhost"].includes(url.hostname)
    )
      return accessError(503);
    const body =
      request.method === "GET"
        ? undefined
        : JSON.stringify(await readBoundedJson(request, 2048));
    const upstream = await fetch(url, {
      method: request.method,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Cookie: request.headers.get("cookie") ?? "",
        Origin: process.env.EVALUATION_ORIGIN ?? "",
      },
      ...(body ? { body } : {}),
    });
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    });
    for (const cookie of upstream.headers.getSetCookie())
      headers.append("Set-Cookie", cookie);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return accessError(503);
  }
}

export { handler as GET, handler as POST };
