import { ingestionEnabled } from "../../../src/ingestion";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    service: "mobility-core",
    status: "ok",
    ingestionEnabled: ingestionEnabled(),
    stage: "local-evaluation",
    readiness: "Query authenticated get_source_health for feed readiness",
  });
}
