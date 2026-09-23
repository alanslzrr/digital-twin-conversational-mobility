import { sourceHealthInputSchema } from "@mobility/contracts";
import { getSourceHealth } from "@mobility/domain";
import { createMcpHandler } from "mcp-handler";
import { authorize } from "../../src/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_source_health",
      {
        title: "Mobility source health",
        description:
          "Reports configured source catalog and explicitly unavailable observations. No live feeds have been initialized yet.",
        inputSchema: sourceHealthInputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ source }) => {
        const result = getSourceHealth(source);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        };
      },
    );
  },
  { serverInfo: { name: "mobility-core", version: "0.1.0" } },
);

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
    "mobility.diagnostics.read",
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
