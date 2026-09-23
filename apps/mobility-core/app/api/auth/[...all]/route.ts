import { authorize } from "../../../../src/auth";
import { getAuth } from "../../../../src/better-auth";

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
  if (!allowed.has(path))
    return Response.json({ error: "not_found" }, { status: 404 });
  const identity = await authorize(
    request,
    {
      secret: process.env.MOBILITY_JWT_SECRET ?? "",
      issuer: process.env.MOBILITY_JWT_ISSUER ?? "",
      audience: process.env.MOBILITY_JWT_AUDIENCE ?? "",
      ...(process.env.EVALUATION_ORIGIN
        ? { allowedOrigin: process.env.EVALUATION_ORIGIN }
        : {}),
    },
    "mobility.evaluation.manage",
  );
  if (identity instanceof Response) return identity;
  try {
    const headers = new Headers(request.headers);
    headers.delete("authorization");
    headers.set("x-evaluation-client-ip", "127.0.0.1");
    const body = request.method === "GET" ? undefined : await request.text();
    if (body && body.length > 2048)
      return Response.json({ error: "request_too_large" }, { status: 413 });
    const url = new URL(`/api/auth/${path}`, process.env.EVALUATION_ORIGIN);
    const response = await getAuth().handler(
      new Request(url, {
        method: request.method,
        headers,
        ...(body ? { body } : {}),
      }),
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return Response.json(
      { error: "authentication_unavailable" },
      { status: 503 },
    );
  }
}

export { handler as GET, handler as POST };
