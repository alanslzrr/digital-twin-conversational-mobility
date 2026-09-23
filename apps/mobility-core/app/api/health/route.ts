export function GET() {
  return Response.json({
    service: "mobility-core",
    status: "ok",
    stage: "foundation",
    liveDataReady: false,
  });
}
