import { authorize } from "../../../src/auth";
import { activate, ingestionEnabled, tick } from "../../../src/ingestion";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  const identity = await authorize(
    request,
    {
      secret: process.env.MOBILITY_JWT_SECRET ?? "",
      issuer: process.env.MOBILITY_JWT_ISSUER ?? "",
      audience: process.env.MOBILITY_JWT_AUDIENCE ?? "",
    },
    "mobility.ingestion.manage",
  );
  if (identity instanceof Response) return identity;
  const headers = { "Cache-Control": "no-store" };
  if (!ingestionEnabled())
    return Response.json({ status: "disabled" }, { status: 409, headers });
  try {
    const text = await request.text();
    if (text.length > 100)
      return Response.json(
        { error: "request_too_large" },
        { status: 413, headers },
      );
    const input = JSON.parse(text || "{}");
    if (input.activate === true) await activate();
    return Response.json(await tick(), { headers });
  } catch {
    return Response.json(
      { error: "ingestion_unavailable" },
      { status: 503, headers },
    );
  }
}
