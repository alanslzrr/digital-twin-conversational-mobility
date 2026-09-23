import { jwtVerify } from "jose";

export type AuthConfig = {
  secret: string;
  issuer: string;
  audience: string;
  allowedOrigin?: string;
};
export type Principal = { subject: string; scopes: string[] };

function reject(status: number, error: string): Response {
  return Response.json(
    { error },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 401
          ? { "WWW-Authenticate": 'Bearer realm="mobility-core"' }
          : {}),
      },
    },
  );
}

export async function authorize(
  request: Request,
  config: AuthConfig,
  requiredScope: string,
): Promise<Principal | Response> {
  if (
    Buffer.byteLength(config.secret) < 32 ||
    !config.issuer ||
    !config.audience
  ) {
    return reject(503, "authentication_not_configured");
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== config.allowedOrigin)
    return reject(403, "origin_not_allowed");
  const match = /^Bearer ([^\s]+)$/i.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!match?.[1]) return reject(401, "authentication_required");
  try {
    const { payload } = await jwtVerify(
      match[1],
      new TextEncoder().encode(config.secret),
      {
        algorithms: ["HS256"],
        issuer: config.issuer,
        audience: config.audience,
        requiredClaims: ["exp", "iat", "sub"],
        maxTokenAge: "7d",
        clockTolerance: 5,
      },
    );
    if (!payload.sub || typeof payload.scope !== "string")
      return reject(401, "invalid_token");
    const scopes = payload.scope.split(/\s+/);
    if (!scopes.includes(requiredScope))
      return reject(403, "insufficient_scope");
    return { subject: payload.sub, scopes };
  } catch {
    return reject(401, "invalid_token");
  }
}
