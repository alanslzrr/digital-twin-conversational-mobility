import "server-only";
// This module is imported only by the server BFF; no URL/SQL passthrough.
import {
  dashboardActivity,
  dashboardData,
  dashboardEntityPage,
  dashboardMapPage,
  dashboardStatus,
  dashboardToolCatalog,
} from "@mobility/contracts";
import { readBoundedJson } from "../../../src/evaluator-auth";
export async function coreDashboard(request: Request, path: string) {
  const base = process.env.MOBILITY_MCP_URL,
    token = process.env.MOBILITY_MCP_TOKEN;
  if (!base || !token) throw new Error("Dashboard not configured");
  const url = new URL(`/internal/dashboard/${path}`, base);
  if (
    url.protocol !== "https:" &&
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("HTTPS required");
  url.search = new URL(request.url).search;
  const cookie = request.headers.get("cookie");
  const body =
    request.method === "POST"
      ? JSON.stringify(await readBoundedJson(request, 16384))
      : undefined;
  const response = await fetch(url, {
    method: request.method,
    cache: "no-store",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body } : {}),
    signal: AbortSignal.any([
      request.signal,
      AbortSignal.timeout(path === "executions" ? 65000 : 10000),
    ]),
  });
  const headers = {
    "Cache-Control": "no-store",
    ...(response.status === 429
      ? { "Retry-After": response.headers.get("retry-after") ?? "60" }
      : {}),
  };
  if (!response.ok) {
    await response.body?.cancel();
    return Response.json(
      {
        error:
          response.status === 409
            ? "snapshot_or_execution_conflict"
            : response.status === 404
              ? "not_found"
              : "dashboard_request_denied",
      },
      { status: response.status, headers },
    );
  }
  const raw = await readBoundedJson(
    new Request("http://internal/response", {
      method: "POST",
      body: response.body,
      duplex: "half",
    } as RequestInit),
    path === "map" || path.includes("/payloads/") ? 1048576 : 262144,
  );
  const schema =
    path === "status"
      ? dashboardStatus
      : path === "tools"
        ? dashboardToolCatalog
        : path === "activity"
          ? dashboardActivity
          : path === "entities"
            ? dashboardEntityPage
            : path === "map"
              ? dashboardMapPage
              : dashboardData;
  return Response.json(schema.parse(raw), { headers });
}
