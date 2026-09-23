export function GET() {
  return Response.json({
    service: "eve-web",
    status: "ok",
    stage: "foundation",
    chatReady: false,
  });
}
