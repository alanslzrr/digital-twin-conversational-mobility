export function GET() {
  return Response.json({
    service: "mobility-core",
    status: "ok",
    stage: "local-evaluation",
    readiness: "Query authenticated get_source_health for feed readiness",
  });
}
