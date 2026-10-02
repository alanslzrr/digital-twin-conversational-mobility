import {
  bikesInputSchema,
  crtmTimetableInputSchema,
  type DashboardToolEffect,
  type DashboardToolName,
  dashboardToolName,
  departuresInputSchema,
  emtArrivalsInputSchema,
  environmentInputSchema,
  historyInputSchema,
  incidentsInputSchema,
  journeyRequestSchema,
  lineStatusInputSchema,
  mobilitySnapshotInputSchema,
  networkStatusInputSchema,
  parkingInputSchema,
  resolveAddressInputSchema,
  resolvePlaceInputSchema,
  roadInputSchema,
  sourceHealthInputSchema,
} from "@mobility/contracts";
import type { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { lineStatus, mobilitySnapshot, networkStatus } from "./aggregates";
import { crtmTimetable } from "./crtm";
import { emtArrivals } from "./emt-arrivals";
import { resolveAddress } from "./geocoding";
import { historicalQuery } from "./history";
import { activate } from "./ingestion";
import { mcpResult } from "./mcp-result";
import {
  bikes,
  departures,
  environment,
  incidents,
  parking,
  resolvePlace,
  roads,
  sourceHealth,
} from "./mobility";
import { planJourney } from "./routing";

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
async function run(action: () => Promise<object>, activateWindow = true) {
  try {
    if (activateWindow) await activate();
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

type Server = Parameters<Parameters<typeof createMcpHandler>[0]>[0];
type Result = Awaited<ReturnType<typeof run>>;
const storedAggregates = new Set<DashboardToolName>([
  "get_line_status",
  "get_network_status",
  "get_mobility_snapshot",
]);
const acquisitionTools = new Set<DashboardToolName>([
  "resolve_address",
  "plan_journey",
  "get_departures",
  "get_emt_arrivals",
  "get_incidents",
  "get_bike_availability",
  "get_environment",
  "get_road_state",
  "get_parking",
]);
function effectsFor(name: DashboardToolName): DashboardToolEffect[] {
  const effects: DashboardToolEffect[] = [];
  if (!storedAggregates.has(name)) effects.push("activate_window");
  if (acquisitionTools.has(name)) effects.push("acquire_provider");
  if (name === "plan_journey" || name === "get_environment")
    effects.push("demand_weather");
  if (
    name === "resolve_address" ||
    name === "get_emt_arrivals" ||
    name === "get_environment" ||
    name === "plan_journey"
  )
    effects.push("write_cache");
  if (name === "plan_journey" || name === "get_departures")
    effects.push("calculate_otp");
  return effects;
}

function defineTool<S extends z.ZodObject>(
  name: DashboardToolName,
  config: {
    title: string;
    description: string;
    inputSchema: S;
    annotations: typeof annotations;
  },
  execute: (input: z.output<S>) => Promise<Result>,
) {
  return {
    name,
    config,
    scope: "mobility.read" as const,
    possibleEffects: effectsFor(name),
    storedAvailability:
      name === "plan_journey" || name === "get_departures"
        ? ("not_materialized" as const)
        : ("selector" as const),
    register(server: Server) {
      server.registerTool(
        name,
        { ...config, inputSchema: config.inputSchema as z.ZodObject },
        (input) => execute(config.inputSchema.parse(input)),
      );
    },
    async execute(input: unknown) {
      return execute(config.inputSchema.parse(input));
    },
  };
}

export const mobilityTools = [
  defineTool(
    "get_line_status",
    {
      title: "Stored line status and coverage",
      description:
        "Recognize a Renfe/EMT line or a CRTM line within a required network. Return retained notices and static coverage, not a normal-service guarantee. No provider refresh.",
      inputSchema: lineStatusInputSchema,
      annotations,
    },
    (input) => run(() => lineStatus(input), false),
  ),
  defineTool(
    "get_network_status",
    {
      title: "Stored network evidence",
      description:
        "Summarize Renfe, EMT, CRTM and DGT stored source coverage and evidence counts, per-stream freshness and missing capabilities. No fanout or provider refresh; data health is not normal network operation.",
      inputSchema: networkStatusInputSchema,
      annotations,
    },
    ({ source }) => run(() => networkStatus(source), false),
  ),
  defineTool(
    "get_mobility_snapshot",
    {
      title: "Stored mobility overview",
      description:
        "Combine retained mobility evidence counts, source coverage, entity freshness and absences. Optional source filter. Per-component observation times, not one live instant or replay; no provider refresh.",
      inputSchema: mobilitySnapshotInputSchema,
      annotations,
    },
    ({ source }) => run(() => mobilitySnapshot(source), false),
  ),
  defineTool(
    "get_source_health",
    {
      title: "Mobility source health",
      description:
        "Persisted source health, freshness, activity window and honest missing coverage.",
      inputSchema: sourceHealthInputSchema,
      annotations,
    },
    ({ source }) => run(() => sourceHealth(source)),
  ),
  defineTool(
    "resolve_place",
    {
      title: "Resolve a canonical Madrid place",
      description:
        "Search imported Renfe, EMT, BiciMAD and CRTM places by name or exact stop number. Use source=emt for buses or source=crtm with network=metro/light-rail/interurban. CRTM includes static validity and evidence-backed station correspondences; its IDs support timetable and routing with active graph coverage. Return candidates; ask the user if ambiguous. No arbitrary-address geocoding. Static wheelchair stop declarations include inheritance, provenance and unknowns; not current equipment operation.",
      inputSchema: resolvePlaceInputSchema,
      annotations,
    },
    ({ query, limit, source, network }) =>
      run(() => resolvePlace(query, limit, source, network)),
  ),
  defineTool(
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
  ),
  defineTool(
    "plan_journey",
    {
      title: "Plan a scheduled journey",
      description:
        "OTP local routes from canonical place IDs. Active release includes Renfe, EMT, Metro Ligero and interurban schedules plus walking. Current Metro de Madrid schedules/routes are outside this evaluation scope; its catalog remains available; no bicycle or car routing. TRANSIT requires transit and permits walking access/egress/transfers; WALK allows walking-only routes; TRANSIT+WALK allows either. Scheduled baseline with matched fresh Renfe RT and alerts applied through Core; inspect per-leg status. Frequency-based times are planning estimates, not exact departures. Walking limit applies to the sum of walking legs. Preserve requested wheelchair preference; accessibilityContext separates boarding, vehicle and alighting, not a whole-route guarantee.",
      inputSchema: journeyRequestSchema,
      annotations,
    },
    (input) => run(() => planJourney(input)),
  ),
  defineTool(
    "get_emt_arrivals",
    {
      title: "EMT bus arrivals at a stop",
      description:
        "Próximas llegadas de autobuses EMT. Resolve the stop first with resolve_place(source=emt). Cached estimates refreshed only on demand with bounded cooldown/backoff; inspect freshness and refresh.error. Destination from provider or unknown; not scheduled departures or routing. Stale estimates are not live countdowns.",
      inputSchema: emtArrivalsInputSchema,
      annotations,
    },
    ({ placeId, limit }) => run(() => emtArrivals(placeId, limit)),
  ),
  defineTool(
    "get_crtm_timetable",
    {
      title: "CRTM static service-day timetable",
      description:
        "Horarios Metro, Metro Ligero e interurbanos CRTM. Resolve source=crtm first. One Madrid service day, calendars/exceptions applied, >24h times preserved. Date/time default to server today/now. Frequency windows are not individual arrivals. Expired coverage is unavailable for current dates; historical service dates remain subject to the existing validity checks. This tool offers no RT, route calculation or knowledge replay. Use plan_journey for supported networks; current Metro de Madrid schedules/routes are outside this evaluation scope. Report provenance, validity, destinations and unknowns. Accessibility separates the actual boarding point and trip vehicle; static declarations are not current equipment status.",
      inputSchema: crtmTimetableInputSchema,
      annotations,
    },
    (input) => run(() => crtmTimetable(input)),
  ),
  defineTool(
    "get_departures",
    {
      title: "Renfe departures",
      description:
        "Scheduled Renfe departures with matched fresh RT arrival/departure estimates or cancellations where available. Never treat arrivals as departures. Static accessibility separates boarding and the identified trip vehicle; do not infer from the line.",
      inputSchema: departuresInputSchema,
      annotations,
    },
    ({ placeId, limit }) => run(() => departures(placeId, limit)),
  ),
  defineTool(
    "get_incidents",
    {
      title: "Published transport and road incidents",
      description:
        "Published Renfe/EMT notices by line, or DGT road incidents (source=dgt; query=road, province or municipality). DGT preserves identity, version, endpoints and publisher validity; includeWithdrawn shows removals, not confirmed cancellations. Inspect freshness and temporal conflicts. Empty results do not mean normal service.",
      inputSchema: incidentsInputSchema,
      annotations,
    },
    (input) => run(() => incidents(input)),
  ),
  defineTool(
    "get_bike_availability",
    {
      title: "BiciMAD availability",
      description:
        "Official GBFS counts and per-station freshness. Search by name or nearest to a canonical place; distances are straight-line.",
      inputSchema: bikesInputSchema,
      annotations,
    },
    (input) => run(() => bikes(input)),
  ),
  defineTool(
    "get_environment",
    {
      title: "Madrid environment and municipal weather",
      description:
        "kind=air: municipal pollutant measurements. kind=weather weatherProduct=observation: exact stationId OR resolved placeId selects nearest fresh station within 20 km, otherwise explicitly stale; no selector explicitly defaults to Retiro. Unknown and known without readings differ; future dates and combined selectors rejected. Show station, distance, observed time and measurement intervals, not street-level current rain. weatherProduct=hourly_forecast|daily_forecast|warnings with resolved placeId and optional fromTime/toTime reuses shared AEMET municipal/CAP cache. plan_journey already includes weatherContext; do not call again for each route. Daily: precipitation probability, sky, dated min/max, at most seven local dates (exclusive end); no time needed for a whole-day question. Daily periods are not hourly estimates and extrema are not departure temperature. Coverage and original periods apply; not a health assessment.",
      inputSchema: environmentInputSchema,
      annotations,
    },
    (input) => run(() => environment(input)),
  ),
  defineTool(
    "get_road_state",
    {
      title: "Madrid traffic measurements",
      description:
        "Find municipal traffic sensors by street/name. Observed flow/occupancy only, not DGT incidents or journey times.",
      inputSchema: roadInputSchema,
      annotations,
    },
    (input) => run(() => roads(input)),
  ),
  defineTool(
    "get_historical_state",
    {
      title: "Historical observation index",
      description:
        "Historical state / histórico BiciMAD, Renfe, EMT, DGT, weather, air, traffic and parking within retained 24 hours. Supply at (ISO offset) OR minutesAgo (server clock). Use knowledge for what the system knew then; event may include later corrections. Partial index with at most five sample entities, not a full reconstruction.",
      inputSchema: historyInputSchema,
      annotations,
    },
    (input) => run(() => historicalQuery(input)),
  ),
  defineTool(
    "get_parking",
    {
      title: "Parking availability and documented prices",
      description:
        "Find Madrid car parks by query (name/street) OR exact parkingId. Optional durationMinutes 1–1440 for cars and date YYYY-MM-DD. Returns independent observed availability and verified EMT tariffs, approximate published/calculated costs or a maximum when bands are incomplete; explicit conditional park-and-ride scenarios. Missing price is not zero; latest published prices may be projected without confirming future validity.",
      inputSchema: parkingInputSchema,
      annotations,
    },
    (input) => run(() => parking(input)),
  ),
];

export function registerMobilityTools(server: Server) {
  for (const tool of mobilityTools) tool.register(server);
}

export function findMobilityTool(name: string) {
  const parsed = dashboardToolName.safeParse(name);
  return parsed.success
    ? mobilityTools.find((tool) => tool.name === parsed.data)
    : undefined;
}

export function mobilityToolCatalog() {
  return mobilityTools.map((tool) => ({
    name: tool.name,
    title: tool.config.title,
    description: tool.config.description,
    inputSchemaJson: JSON.stringify(z.toJSONSchema(tool.config.inputSchema)),
    requiredScope: tool.scope,
    possibleEffects: tool.possibleEffects,
    storedAvailability: tool.storedAvailability,
  }));
}
