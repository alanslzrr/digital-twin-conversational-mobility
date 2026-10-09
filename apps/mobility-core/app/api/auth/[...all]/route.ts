import { createHash } from "node:crypto";
import { authorize } from "../../../../src/auth";
import { getAuth } from "../../../../src/better-auth";
import {
  boundedText,
  ControlError,
  controlError,
} from "../../../../src/control/errors";
import { controlIdentity, rateLimit } from "../../../../src/control/identity";
import { drainAccountMail } from "../../../../src/control/mail";
import { database } from "../../../../src/database";

export const runtime = "nodejs";
const allowed = new Set([
  "sign-in/email",
  "sign-out",
  "get-session",
  "change-password",
  "request-password-reset",
  "reset-password",
  "two-factor/enable",
  "two-factor/verify-totp",
  "two-factor/verify-backup-code",
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
    const body =
      request.method === "GET" ? undefined : await boundedText(request, 4096);
    if (body && body.length > 4096)
      return Response.json({ error: "request_too_large" }, { status: 413 });
    const url = new URL(`/api/auth/${path}`, process.env.EVALUATION_ORIGIN);
    if (body && ["sign-in/email", "request-password-reset"].includes(path)) {
      const input = JSON.parse(body);
      const account = createHash("sha256")
        .update(
          String(input.email ?? "")
            .trim()
            .toLowerCase(),
        )
        .digest("hex");
      await rateLimit(
        database(),
        `auth:${path}:${account}`,
        path === "sign-in/email" ? 10 : 3,
        path === "sign-in/email" ? 60 : 3600,
      );
    }
    if (path === "two-factor/enable") {
      const session = await getAuth().api.getSession({ headers });
      if (
        session?.user.twoFactorEnabled &&
        !(await controlIdentity(headers)).mfa
      )
        throw new ControlError("mfa_required", 403);
    }
    const response = await getAuth().handler(
      new Request(url, {
        method: request.method,
        headers,
        ...(body ? { body } : {}),
      }),
    );
    if (path === "request-password-reset") {
      await drainAccountMail();
      return Response.json(
        {
          status: true,
          message: "Si la cuenta está habilitada, recibirás un correo.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (response.ok && path === "two-factor/enable") {
      const session = await getAuth().api.getSession({ headers });
      if (session)
        await database()`DELETE FROM control_mfa WHERE session_id IN (SELECT id FROM auth_session WHERE "userId"=${session.user.id})`;
    }
    if (
      response.ok &&
      ["two-factor/verify-totp", "two-factor/verify-backup-code"].includes(path)
    ) {
      const cookies = new Map(
        (headers.get("cookie") ?? "")
          .split(";")
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => {
            const i = c.indexOf("=");
            return [c.slice(0, i), c.slice(i + 1)];
          }),
      );
      for (const set of response.headers.getSetCookie()) {
        const first = set.split(";")[0] ?? "";
        const i = first.indexOf("=");
        if (i > 0) cookies.set(first.slice(0, i), first.slice(i + 1));
      }
      const verifiedHeaders = new Headers(headers);
      verifiedHeaders.set(
        "cookie",
        [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      );
      const session = await getAuth().api.getSession({
        headers: verifiedHeaders,
      });
      if (session?.user.twoFactorEnabled)
        await database().begin(async (tx) => {
          await tx`INSERT INTO control_mfa(session_id) VALUES(${session.session.id}) ON CONFLICT DO NOTHING`;
          // Enrollment must not grant admin access to old password-only sessions.
          await tx`DELETE FROM auth_session WHERE "userId"=${session.user.id} AND id<>${session.session.id} AND NOT EXISTS(SELECT 1 FROM control_mfa f WHERE f.session_id=auth_session.id)`;
        });
    }
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (path === "request-password-reset")
      return Response.json(
        {
          status: true,
          message: "Si la cuenta está habilitada, recibirás un correo.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (error instanceof ControlError) return controlError(error);
    return Response.json(
      { error: "authentication_unavailable" },
      { status: 503 },
    );
  }
}

export { handler as GET, handler as POST };
