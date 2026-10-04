import { coreDashboard } from "../../../../data/queries/dashboard";
import {
  allowedBrowserRequest,
  readIdentity,
} from "../../../../src/evaluator-auth";
export const runtime = "nodejs";
export const maxDuration = 65;
async function dispatch(
  request: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const headers = { "Cache-Control": "no-store" };
  if (!allowedBrowserRequest(request))
    return Response.json({ error: "access_denied" }, { status: 403, headers });
  try {
    if (!(await readIdentity(request)))
      return Response.json(
        { error: "authentication_required" },
        { status: 401, headers },
      );
    const { path } = await ctx.params;
    const suffix = path.join("/");
    const allowed =
      request.method === "POST"
        ? /^(inspect|executions|activity)$/.test(suffix)
        : request.method === "GET" &&
          /^(status|overview|tools|entities|map|sources|events|conversations|entities\/[^/]+\/[^/]+(?:\/history)?|sources\/[^/]+|events\/\d+|executions\/[0-9a-f-]{36}|conversations\/[A-Za-z0-9_-]{1,160}\/(summary|events)|conversations\/[A-Za-z0-9_-]{1,160}\/payloads\/[0-9a-f-]{36})$/.test(
            suffix,
          );
    if (!allowed)
      return Response.json({ error: "not_found" }, { status: 404, headers });
    return await coreDashboard(request, suffix);
  } catch {
    return Response.json(
      { error: "dashboard_unavailable" },
      { status: 503, headers },
    );
  }
}

export { dispatch as GET, dispatch as POST };
