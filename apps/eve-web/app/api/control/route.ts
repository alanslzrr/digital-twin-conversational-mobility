import { coreControlUrl } from "../../../src/control-client";
import {
  accessError,
  allowedBrowserRequest,
  readBoundedJson,
} from "../../../src/evaluator-auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!allowedBrowserRequest(request)) return accessError(403);
  try {
    const token = process.env.MOBILITY_MCP_TOKEN;
    if (!token) return accessError(503);
    const response = await fetch(coreControlUrl("/internal/control"), {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: request.headers.get("cookie") ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(await readBoundedJson(request, 32768)),
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...(response.headers.has("retry-after")
          ? { "Retry-After": response.headers.get("retry-after") ?? "60" }
          : {}),
      },
    });
  } catch {
    return accessError(503);
  }
}
