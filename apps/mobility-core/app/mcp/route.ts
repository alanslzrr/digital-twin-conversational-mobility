import {
  bikesInputSchema,
  departuresInputSchema,
  environmentInputSchema,
  historyInputSchema,
  incidentsInputSchema,
  journeyRequestSchema,
  parkingInputSchema,
  resolvePlaceInputSchema,
  roadInputSchema,
  sourceHealthInputSchema,
} from "@mobility/contracts";
import { createMcpHandler } from "mcp-handler";
import { authorize } from "../../src/auth";
import { activate } from "../../src/ingestion";
import {
  bikes,
  departures,
  environment,
  history,
  incidents,
  parking,
  resolvePlace,
  roads,
  sourceHealth,
} from "../../src/mobility";
import { planJourney } from "../../src/routing";

export const runtime = "nodejs";
export const maxDuration = 60;
const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const result = (value: object) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  structuredContent: value as Record<string, unknown>,
});
async function run(action: () => Promise<object>) {
  try {
    await activate();
    return result(await action());
  } catch {
    return {
      ...result({
        status: "unavailable",
        reason: "mobility_backend_unavailable",
      }),
      isError: true,
    };
  }
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_source_health",
      {
        title: "Mobility source health",
        description:
          "Persisted source health, freshness, activity window and honest missing coverage.",
        inputSchema: sourceHealthInputSchema,
        annotations,
      },
      ({ source }) => run(() => sourceHealth(source)),
    );
    server.registerTool(
      "resolve_place",
      {
        title: "Resolve a canonical Madrid place",
        description:
          "Search imported Renfe and BiciMAD places. Return candidates; ask the user if ambiguous. No arbitrary-address geocoding.",
        inputSchema: resolvePlaceInputSchema,
        annotations,
      },
      ({ query, limit }) => run(() => resolvePlace(query, limit)),
    );
    server.registerTool(
      "plan_journey",
      {
        title: "Plan a scheduled journey",
        description:
          "OTP local routes from canonical place IDs. Renfe plus walking ONLY; no Metro/EMT, bicycle or car routing. TRANSIT requires transit and permits walking access/egress/transfers; WALK allows walking-only routes; TRANSIT+WALK allows either. Scheduled times, not real-time routes. Walking limit applies to the sum of walking legs.",
        inputSchema: journeyRequestSchema,
        annotations,
      },
      (input) => run(() => planJourney(input)),
    );
    server.registerTool(
      "get_departures",
      {
        title: "Renfe departures",
        description:
          "Scheduled Renfe departures with matched fresh RT arrival/departure estimates or cancellations where available. Never treat arrivals as departures.",
        inputSchema: departuresInputSchema,
        annotations,
      },
      ({ placeId, limit }) => run(() => departures(placeId, limit)),
    );
    server.registerTool(
      "get_incidents",
      {
        title: "Published Renfe incidents",
        description:
          "Published notices from Renfe Madrid (default) or EMT buses (source=emt), optionally by line. EMT includes upcoming/unknown periods; inspect temporalStatus and freshness. No alerts does not mean no disruptions.",
        inputSchema: incidentsInputSchema,
        annotations,
      },
      (input) => run(() => incidents(input)),
    );
    server.registerTool(
      "get_bike_availability",
      {
        title: "BiciMAD availability",
        description:
          "Official GBFS counts and per-station freshness. Search by name or nearest to a canonical place; distances are straight-line.",
        inputSchema: bikesInputSchema,
        annotations,
      },
      (input) => run(() => bikes(input)),
    );
    server.registerTool(
      "get_environment",
      {
        title: "Measured Madrid environment",
        description:
          "kind=air: municipal pollutant measurements. kind=weather: AEMET Madrid-Retiro observations. Units, observation time and freshness; not forecasts, weather alerts or a health assessment.",
        inputSchema: environmentInputSchema,
        annotations,
      },
      (input) => run(() => environment(input)),
    );
    server.registerTool(
      "get_road_state",
      {
        title: "Madrid traffic measurements",
        description:
          "Find municipal traffic sensors by street/name. Observed flow/occupancy only, not DGT incidents or journey times.",
        inputSchema: roadInputSchema,
        annotations,
      },
      (input) => run(() => roads(input)),
    );
    server.registerTool(
      "get_historical_state",
      {
        title: "Historical observation index",
        description:
          "Index of retained observations within 24 hours. event may include later corrections; knowledge includes only information ingested by that instant. Includes EMT published notices. Not a full network reconstruction.",
        inputSchema: historyInputSchema,
        annotations,
      },
      ({ source, at, mode }) => run(() => history(source, at, mode)),
    );
    server.registerTool(
      "get_parking",
      {
        title: "Observed parking availability",
        description:
          "Find participating Madrid public car parks by name or street. Per-category timestamps and freshness; missing availability is not zero spaces.",
        inputSchema: parkingInputSchema,
        annotations,
      },
      (input) => run(() => parking(input)),
    );
  },
  { serverInfo: { name: "mobility-core", version: "0.2.0" } },
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
