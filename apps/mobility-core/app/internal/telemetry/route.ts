import { dashboardScopes } from "@mobility/contracts";
import { authorize } from "../../../src/auth";
import { DashboardAccessError } from "../../../src/dashboard/access";
import { readBoundedJson } from "../../../src/dashboard/body";
import { storeTelemetry } from "../../../src/observability/telemetry";
export const runtime = "nodejs";
export const maxDuration = 5;
export async function POST(request: Request) {
  const service = await authorize(
    request,
    {
      secret: process.env.MOBILITY_JWT_SECRET ?? "",
      issuer: process.env.MOBILITY_JWT_ISSUER ?? "",
      audience: process.env.MOBILITY_JWT_AUDIENCE ?? "",
    },
    dashboardScopes.telemetry,
  );
  if (service instanceof Response) return service;
  const headers = { "Cache-Control": "no-store" };
  try {
    return Response.json(
      await storeTelemetry(await readBoundedJson(request, 1048576)),
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof DashboardAccessError ? e.code : "telemetry_unavailable",
      },
      { status: e instanceof DashboardAccessError ? e.status : 503, headers },
    );
  }
}
