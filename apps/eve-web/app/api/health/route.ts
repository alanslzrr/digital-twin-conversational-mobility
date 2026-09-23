export function GET() {
  return Response.json({
    service: "eve-web",
    status: "ok",
    stage: "local-evaluation",
    readiness:
      "Liveness only; evaluator authentication and model configuration required",
  });
}
