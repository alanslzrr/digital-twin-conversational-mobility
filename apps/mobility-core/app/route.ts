export function GET() {
  return Response.json({
    service: "mobility-core",
    endpoints: { health: "/api/health", mcp: "/mcp" },
  });
}
