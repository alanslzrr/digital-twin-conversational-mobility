import {
  dashboardActivityInput,
  dashboardCategory,
  dashboardData,
  dashboardScopes,
  dashboardToolCatalog,
  safeProjection,
  sourceIdSchema,
} from "@mobility/contracts";
import { ZodError, z } from "zod";
import { authorize } from "../../../../src/auth";
import {
  DashboardAccessError,
  readDashboardIdentity,
} from "../../../../src/dashboard/access";
import { readBoundedJson } from "../../../../src/dashboard/body";
import { readEntities } from "../../../../src/dashboard/entities";
import {
  executeManual,
  readExecution,
} from "../../../../src/dashboard/executions";
import { inspectStored } from "../../../../src/dashboard/inspector";
import {
  readDashboardStatus,
  renewDashboardActivity,
} from "../../../../src/dashboard/queries";
import { takeDashboardRate } from "../../../../src/dashboard/rate-limit";
import {
  readConversationIndex,
  readOperationalEvents,
  readSources,
  readTrace,
} from "../../../../src/dashboard/readers";
import { mobilityToolCatalog } from "../../../../src/tool-registry";
export const runtime = "nodejs";
export const maxDuration = 65;
const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ path: string[] }> };
async function dispatch(request: Request, context: Context) {
  const { path } = await context.params;
  const resource = path.join("/");
  const activity = request.method === "POST" && resource === "activity";
  const execute = request.method === "POST" && resource === "executions";
  const inspect = request.method === "POST" && resource === "inspect";
  const reading =
    request.method === "GET" &&
    /^(status|overview|tools|entities|map|sources|events|conversations|entities\/[^/]+\/[^/]+|sources\/[^/]+|events\/\d+|executions\/[0-9a-f-]{36}|conversations\/[A-Za-z0-9_-]{1,160}\/(summary|events)|conversations\/[A-Za-z0-9_-]{1,160}\/payloads\/[0-9a-f-]{36})$/.test(
      resource,
    );
  if (!reading && !activity && !execute && !inspect)
    return Response.json({ error: "not_found" }, { status: 404, headers });
  const service = await authorize(
    request,
    {
      secret: process.env.MOBILITY_JWT_SECRET ?? "",
      issuer: process.env.MOBILITY_JWT_ISSUER ?? "",
      audience: process.env.MOBILITY_JWT_AUDIENCE ?? "",
    },
    activity
      ? dashboardScopes.activity
      : execute
        ? dashboardScopes.execute
        : dashboardScopes.read,
  );
  if (service instanceof Response) return service;
  try {
    const identity = await readDashboardIdentity(request.headers),
      owner = identity.evaluatorId;
    if (resource.startsWith("executions/") || resource.includes("/payloads/"))
      z.uuid().parse(path.at(-1));
    const params = new URL(request.url).searchParams;
    const allowed =
      resource === "entities" || resource === "map"
        ? [
            "category",
            "source",
            "freshness",
            "search",
            "cursor",
            "limit",
            "bbox",
          ]
        : resource === "events" || resource.startsWith("events/")
          ? ["from", "to", "source", "type", "severity", "cursor", "limit"]
          : resource === "conversations"
            ? ["cursor"]
            : resource.endsWith("/events")
              ? ["turn", "kind", "cursor", "limit"]
              : [];
    for (const key of params.keys())
      if (
        !allowed.includes(key) ||
        params.getAll(key).length !== 1 ||
        String(params.get(key)).length > 4096
      )
        throw new DashboardAccessError(400, "invalid_request");
    const rate = await takeDashboardRate(
      owner,
      activity ? "activity" : execute ? "execute" : "read",
    );
    if (!rate.allowed)
      return Response.json(
        { error: "dashboard_rate_limited" },
        {
          status: 429,
          headers: { ...headers, "Retry-After": String(rate.retryAfter) },
        },
      );
    let result: unknown;
    if (activity) {
      const body = dashboardActivityInput.safeParse(
        await readBoundedJson(request, 128),
      );
      if (!body.success) throw new DashboardAccessError(400, "invalid_request");
      result = await renewDashboardActivity();
    } else if (resource === "status") result = await readDashboardStatus();
    else if (resource === "tools")
      result = dashboardToolCatalog.parse({
        schemaVersion: 1,
        readAt: new Date().toISOString(),
        tools: mobilityToolCatalog(),
      });
    else {
      const query: Record<string, unknown> = Object.fromEntries(params);
      if (query.limit !== undefined) query.limit = Number(query.limit);
      if (query.bbox !== undefined)
        query.bbox = String(query.bbox).split(",").map(Number);
      let data: unknown;
      if (inspect) {
        const value = await readBoundedJson(request, 16384);
        const projection = safeProjection(await inspectStored(value), 240000);
        data = projection.data;
      } else if (execute)
        data = await executeManual(
          owner,
          await readBoundedJson(request, 16384),
          request.signal,
          service.scopes,
        );
      else if (resource.startsWith("executions/"))
        data = await readExecution(owner, path[1] ?? "");
      else if (resource === "entities" || resource === "map")
        result = await readEntities(query, owner, resource === "map");
      else if (resource.startsWith("entities/")) {
        const category = dashboardCategory.parse(path[1]);
        const page = await readEntities({ category }, owner, false, path[2]);
        if (!("entities" in page) || !page.entities.length)
          throw new DashboardAccessError(404, "not_found");
        data = page;
      } else if (resource === "sources" || resource.startsWith("sources/"))
        data = await readSources(
          path[1] ? sourceIdSchema.parse(path[1]) : undefined,
        );
      else if (resource === "overview")
        data = {
          status: await readDashboardStatus(),
          sources: await readSources(),
        };
      else if (resource === "events" || resource.startsWith("events/")) {
        const to = new Date().toISOString();
        data = await readOperationalEvents(
          {
            from: new Date(Date.now() - 7 * 86400000).toISOString(),
            to,
            ...query,
          },
          owner,
          path[1],
        );
      } else if (resource === "conversations")
        data = await readConversationIndex(
          owner,
          params.get("cursor") ?? undefined,
        );
      else if (resource.startsWith("conversations/"))
        data = await readTrace(
          owner,
          path[1] ?? "",
          path[2] ?? "",
          params,
          path[3],
        );
      if (result === undefined)
        result = dashboardData.parse({
          schemaVersion: 1,
          readAt: new Date().toISOString(),
          data: data ?? null,
          truncated: false,
          nextCursor: null,
        });
    }
    const body = JSON.stringify(result);
    const max =
      resource === "status"
        ? 16384
        : resource === "map" || resource.includes("/payloads/")
          ? 1048576
          : 262144;
    if (Buffer.byteLength(body) > max)
      throw new DashboardAccessError(503, "response_limit");
    return new Response(body, {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof DashboardAccessError
            ? e.code
            : e instanceof ZodError
              ? "invalid_request"
              : "dashboard_unavailable",
      },
      {
        status:
          e instanceof DashboardAccessError
            ? e.status
            : e instanceof ZodError
              ? 400
              : 503,
        headers,
      },
    );
  }
}

export { dispatch as GET, dispatch as POST };
