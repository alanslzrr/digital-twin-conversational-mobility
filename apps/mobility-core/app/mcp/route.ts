import { createMcpHandler } from "mcp-handler";
import { authorize } from "../../src/auth";
import { registerMobilityTools } from "../../src/tool-registry";

export const runtime = "nodejs";
export const maxDuration = 60;
const handler = createMcpHandler(registerMobilityTools, {
  serverInfo: { name: "mobility-core", version: "0.2.0" },
});

async function authenticatedHandler(request: Request) {
  const identity = await authorize(
    request,
    {
      secret: process.env.MOBILITY_JWT_SECRET ?? "",
      issuer: process.env.MOBILITY_JWT_ISSUER ?? "",
      audience: process.env.MOBILITY_JWT_AUDIENCE ?? "",
      ...(process.env.MOBILITY_ALLOWED_ORIGIN
        ? { allowedOrigin: process.env.MOBILITY_ALLOWED_ORIGIN }
        : {}),
    },
    "mobility.read",
  );
  if (identity instanceof Response) return identity;
  const response = await handler(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export {
  authenticatedHandler as GET,
  authenticatedHandler as POST,
  authenticatedHandler as DELETE,
};
