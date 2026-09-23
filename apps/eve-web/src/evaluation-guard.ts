import type { HttpRouteDefinition } from "eve/channels";
import {
  accessError,
  allowedBrowserRequest,
  coreAccess,
  readBoundedJson,
  readIdentity,
} from "./evaluator-auth";

// Wrap the channel itself, not Next middleware: Vercel routes EVE ahead of Next.
export function protectEvaluationRoute(
  route: HttpRouteDefinition,
): HttpRouteDefinition {
  const sessionRoute = route.path.startsWith("/eve/v1/session");
  const infoRoute = route.path === "/eve/v1/info";
  if (!sessionRoute && !infoRoute) return route; // Framework callbacks keep their own capability authentication.
  return {
    ...route,
    handler: async (request, context) => {
      let identity: Awaited<ReturnType<typeof readIdentity>>;
      try {
        identity = await readIdentity(request);
      } catch {
        return accessError(503);
      }
      if (!identity) return accessError(401);
      if (!allowedBrowserRequest(request)) return accessError(403);
      const sessionId =
        context.params.sessionId ?? context.params.parentSessionId;
      const creating =
        route.method === "POST" && route.path === "/eve/v1/session";
      if (sessionRoute && !creating && !sessionId) return accessError(403);
      const generating =
        request.method === "POST" &&
        (creating ||
          route.path === "/eve/v1/session/:sessionId" ||
          route.path.endsWith("/compact"));
      if (request.method === "POST") {
        try {
          const body = await readBoundedJson(request.clone());
          if (!body || typeof body !== "object" || Array.isArray(body))
            return accessError(400);
          // Do not accept caller-defined callbacks, forwarded identities or runtime settings.
          const allowed = new Set([
            "message",
            "operationId",
            "capabilities",
            "turnPolicy",
            "inputResponses",
            "reason",
            "taskId",
            "tasks",
            "turnId",
          ]);
          if (Object.keys(body).some((key) => !allowed.has(key)))
            return accessError(400);
        } catch {
          return accessError(400);
        }
      }
      try {
        const access = await coreAccess({
          action: "authorize",
          principalId: identity.principalId,
          ...(sessionId ? { sessionId } : {}),
          consume: generating,
        });
        if (!access.ok) return accessError(access.status);
        const response = await route.handler(request, context);
        if (creating && response.ok) {
          const body = await response.clone().json();
          if (typeof body.sessionId !== "string") return accessError(503);
          const registered = await coreAccess({
            action: "register",
            principalId: identity.principalId,
            sessionId: body.sessionId,
          });
          if (!registered.ok) return accessError(503); // Unknown/orphan sessions remain inaccessible.
        }
        if (sessionId && route.path.endsWith("/reset") && response.ok) {
          const revoked = await coreAccess({
            action: "revoke",
            principalId: identity.principalId,
            sessionId,
          });
          if (!revoked.ok) return accessError(503);
        }
        return response;
      } catch {
        return accessError(503);
      }
    },
  };
}
