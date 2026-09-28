import type { lineStatusInputSchema, SourceId } from "@mobility/contracts";
import { madridDate } from "@mobility/domain";
import type { z } from "zod";
import { database } from "./database";
import { incidents, sourceHealth } from "./mobility";

const warning =
  "Partial stored evidence, not a service-normality verdict. Missing, stale or empty notices do not establish normal operation, accessibility or complete network coverage. No providers were queried by this tool.";
export async function lineStatus(input: z.infer<typeof lineStatusInputSchema>) {
  const asOf = new Date().toISOString();
  if (input.source !== "crtm") {
    if (input.network)
      return {
        status: "unavailable",
        reason: "network_filter_requires_crtm",
        warning,
      };
    const result = await incidents(
      {
        source: input.source,
        line: input.line,
        limit: input.limit,
        includeWithdrawn: false,
      },
      false,
    );
    return {
      asOf,
      source: input.source,
      scope: "published_line_notices_only",
      serviceStatus: "not_established",
      ...result,
      warning,
    };
  }
  if (!input.network)
    return {
      asOf,
      status: "needs_clarification",
      reason: "crtm_network_required",
      networks: ["metro", "light-rail", "interurban", "emt"],
      warning,
    };
  const sql = database();
  const [feed] =
    await sql`SELECT version,fetched_at,imported_at,service_start::text,service_end::text,manifest FROM crtm_feed WHERE dataset_id=${input.network} AND enabled`;
  if (!feed)
    return {
      asOf,
      status: "unavailable",
      reason: "catalog_unavailable",
      warning,
    };
  const routes =
    await sql`SELECT external_id,short_name,long_name FROM crtm_routes WHERE dataset_id=${input.network} AND upper(trim(short_name))=upper(trim(${input.line})) ORDER BY external_id LIMIT ${input.limit + 1}`;
  return {
    asOf,
    source: "crtm",
    network: input.network,
    status: routes.length ? "known_line" : "unknown_line",
    lineIdentity: {
      requested: input.line,
      namespace: `crtm.gtfs.${input.network}.route`,
      routes: routes.slice(0, input.limit),
      truncated: routes.length > input.limit,
    },
    serviceStatus: "not_established",
    notices: {
      status: "unavailable",
      reason: "no_crtm_realtime_or_alert_source",
    },
    staticCatalog: {
      ...feed,
      currentServiceEnvelope:
        madridDate() >= feed.service_start && madridDate() <= feed.service_end,
    },
    warning,
  };
}

export async function mobilitySnapshot(source?: SourceId) {
  const health = await sourceHealth(source);
  const components = health.sources.map((s) => ({
    source: s.id,
    status: s.status,
    capability: s.capability,
    streams: s.streams,
    staticFeed: s.staticFeed,
    ...("staticCatalogs" in s ? { staticCatalogs: s.staticCatalogs } : {}),
    ...(s.id === "emt"
      ? {
          arrivalsCoverage:
            "Per-stop cache only; not a network-wide observation. Use get_emt_arrivals for a requested stop.",
        }
      : {}),
  }));
  return {
    asOf: health.asOf,
    readCompletedAt: new Date().toISOString(),
    status: "partial_coverage",
    components,
    activityWindow: health.activityWindow,
    workers: health.workers,
    warning,
    temporalScope:
      "Each component retains its own observation/ingestion times and entityCoverage. This is not an atomic historical replay or a synchronized live picture.",
  };
}
export async function networkStatus(source?: "renfe" | "emt" | "crtm" | "dgt") {
  const view = await mobilitySnapshot(source);
  return {
    ...view,
    components: view.components.filter((c) =>
      ["renfe", "emt", "crtm", "dgt"].includes(c.source),
    ),
    scope:
      "Transport networks and DGT road incidents; source availability is not network operating status.",
  };
}
