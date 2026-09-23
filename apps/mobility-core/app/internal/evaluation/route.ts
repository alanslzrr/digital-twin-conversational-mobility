import { authorize } from "../../../src/auth";
import { evaluateAccess, evaluationAction } from "../../../src/evaluation";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  const identity = await authorize(
    request,
    {
      secret: process.env.MOBILITY_JWT_SECRET ?? "",
      issuer: process.env.MOBILITY_JWT_ISSUER ?? "",
      audience: process.env.MOBILITY_JWT_AUDIENCE ?? "",
    },
    "mobility.evaluation.manage",
  );
  if (identity instanceof Response) return identity;
  const headers = { "Cache-Control": "no-store" };
  try {
    const text = await request.text();
    if (text.length > 2048)
      return Response.json(
        { error: "request_too_large" },
        { status: 413, headers },
      );
    const input = evaluationAction.safeParse(JSON.parse(text));
    if (!input.success)
      return Response.json(
        { error: "invalid_request" },
        { status: 400, headers },
      );
    const result = await evaluateAccess(input.data, request.headers);
    return Response.json(result.body, { status: result.status, headers });
  } catch {
    return Response.json(
      { error: "evaluation_unavailable" },
      { status: 503, headers },
    );
  }
}
