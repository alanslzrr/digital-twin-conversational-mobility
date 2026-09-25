import {
  bikesInputSchema,
  crtmTimetableInputSchema,
  departuresInputSchema,
  emtArrivalsInputSchema,
  environmentInputSchema,
  historyInputSchema,
  incidentsInputSchema,
  journeyRequestSchema,
  parkingInputSchema,
  resolveAddressInputSchema,
  resolvePlaceInputSchema,
  roadInputSchema,
  sourceHealthInputSchema,
} from "@mobility/contracts";
import { createMcpHandler } from "mcp-handler";
import { authorize } from "../../src/auth";
import { crtmTimetable } from "../../src/crtm";
import { emtArrivals } from "../../src/emt-arrivals";
import { resolveAddress } from "../../src/geocoding";
import { historicalQuery } from "../../src/history";
import { activate } from "../../src/ingestion";
import { mcpResult } from "../../src/mcp-result";
import {
  bikes,
  departures,
  environment,
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
async function run(action: () => Promise<object>) {
  try {
    await activate();
    return mcpResult(await action());
  } catch {
    return {
      ...mcpResult({
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
          "Search imported Renfe, EMT, BiciMAD and CRTM places by name or exact stop number. Use source=emt for buses or source=crtm with network=metro/light-rail/interurban. CRTM includes static validity and evidence-backed station correspondences; its IDs support timetable and routing with active graph coverage. Return candidates; ask the user if ambiguous. No arbitrary-address geocoding.",
        inputSchema: resolvePlaceInputSchema,
        annotations,
      },
      ({ query, limit, source, network }) =>
        run(() => resolvePlace(query, limit, source, network)),
    );
    server.registerTool(
      "resolve_address",
      {
        title: "Resolve a public address with catalog-first fallback",
        description:
          "Resolve Madrid addresses: local mobility catalogs first, then configured external geocoder with explicit consent, bounded shared rate and cache. Preserve candidates and ask to confirm ambiguity/precision. No autocomplete/bulk lookup or confidential/personal addresses. Attribution/provenance required.",
        inputSchema: resolveAddressInputSchema,
        annotations,
      },
      ({ query, allowExternal }) =>
        run(() => resolveAddress(query, allowExternal)),
    );
    server.registerTool(
      "plan_journey",
      {
        title: "Plan a scheduled journey",
        description:
          "OTP local routes from canonical place IDs. Active release includes Renfe, EMT, Metro Ligero and interurban schedules plus walking. Metro expired schedules are excluded; no bicycle or car routing. TRANSIT requires transit and permits walking access/egress/transfers; WALK allows walking-only routes; TRANSIT+WALK allows either. Scheduled baseline with matched fresh Renfe RT and alerts applied through Core; inspect per-leg status. Frequency-based times are planning estimates, not exact departures. Walking limit applies to the sum of walking legs.",
        inputSchema: journeyRequestSchema,
        annotations,
      },
      (input) => run(() => planJourney(input)),
    );
    server.registerTool(
      "get_emt_arrivals",
      {
        title: "EMT bus arrivals at a stop",
        description:
          "Próximas llegadas de autobuses EMT. Resolve the stop first with resolve_place(source=emt). Cached estimates refreshed only on demand with bounded cooldown/backoff; inspect freshness and refresh.error. Destination from provider or unknown; not scheduled departures or routing. Stale estimates are not live countdowns.",
        inputSchema: emtArrivalsInputSchema,
        annotations,
      },
      ({ placeId, limit }) => run(() => emtArrivals(placeId, limit)),
    );
    server.registerTool(
      "get_crtm_timetable",
      {
        title: "CRTM static service-day timetable",
        description:
          "Horarios Metro, Metro Ligero e interurbanos CRTM. Resolve source=crtm first. One Madrid service day, calendars/exceptions applied, >24h times preserved. Date/time default to server today/now. Frequency windows are not individual arrivals. Expired coverage is unavailable; no RT, routing or knowledge replay. Report provenance, validity, destinations and unknowns.",
        inputSchema: crtmTimetableInputSchema,
        annotations,
      },
      (input) => run(() => crtmTimetable(input)),
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
          "Historical state / histórico BiciMAD, Renfe, EMT, weather, air, traffic and parking within retained 24 hours. Supply at (ISO offset) OR minutesAgo (server clock). Use knowledge for what the system knew then; event may include later corrections. Partial index with at most five sample entities, not a full reconstruction.",
        inputSchema: historyInputSchema,
        annotations,
      },
      (input) => run(() => historicalQuery(input)),
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
