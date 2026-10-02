import {
  dashboardActivityInput,
  dashboardScopes,
  dashboardToolCatalog,
} from "@mobility/contracts";
import { authorize } from "../../../../src/auth";
import {
  DashboardAccessError,
  readDashboardIdentity,
} from "../../../../src/dashboard/access";
import { readBoundedJson } from "../../../../src/dashboard/body";
import {
  readDashboardStatus,
  renewDashboardActivity,
} from "../../../../src/dashboard/queries";
import { takeDashboardRate } from "../../../../src/dashboard/rate-limit";
import { mobilityToolCatalog } from "../../../../src/tool-registry";

export const runtime = "nodejs";
export const maxDuration = 30;
const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ path: string[] }> };
async function dispatch(request: Request, context: Context) {
  const { path } = await context.params;
  const resource = path.join("/");
  const reading =
    request.method === "GET" && ["status", "tools"].includes(resource);
  const activity = request.method === "POST" && resource === "activity";
  if (!reading && !activity)
    return Response.json({ error: "not_found" }, { status: 404, headers });
  const service = await authorize(
    request,
    {
      secret: process.env.MOBILITY_JWT_SECRET ?? "",
      issuer: process.env.MOBILITY_JWT_ISSUER ?? "",
      audience: process.env.MOBILITY_JWT_AUDIENCE ?? "",
    },
    activity ? dashboardScopes.activity : dashboardScopes.read,
  );
  if (service instanceof Response) return service;
  try {
    if (new URL(request.url).search)
      throw new DashboardAccessError(400, "invalid_request");
    const identity = await readDashboardIdentity(request.headers);
    if (activity) {
      const parsed = dashboardActivityInput.safeParse(
        await readBoundedJson(request, 128),
      );
      if (!parsed.success)
        throw new DashboardAccessError(400, "invalid_request");
    }
    const rate = await takeDashboardRate(
      identity.evaluatorId,
      activity ? "activity" : "read",
    );
    if (!rate.allowed)
      return Response.json(
        { error: "dashboard_rate_limited" },
        {
          status: 429,
          headers: { ...headers, "Retry-After": String(rate.retryAfter) },
        },
      );
    const result = activity
      ? await renewDashboardActivity()
      : resource === "status"
        ? await readDashboardStatus()
        : dashboardToolCatalog.parse({
            schemaVersion: 1,
            readAt: new Date().toISOString(),
            tools: mobilityToolCatalog(),
          });
    const body = JSON.stringify(result);
    if (Buffer.byteLength(body) > (resource === "status" ? 16384 : 256 * 1024))
      throw new DashboardAccessError(503, "dashboard_unavailable");
    return new Response(body, {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof DashboardAccessError
            ? error.code
            : "dashboard_unavailable",
      },
      {
        status: error instanceof DashboardAccessError ? error.status : 503,
        headers,
      },
    );
  }
}

export { dispatch as GET, dispatch as POST };
