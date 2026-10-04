import * as schemas from "@mobility/contracts";
import { dashboardInspectInput } from "@mobility/contracts";
import { lineStatus, mobilitySnapshot, networkStatus } from "../aggregates";
import { crtmTimetable } from "../crtm";
import { emtArrivals } from "../emt-arrivals";
import { resolveAddress } from "../geocoding";
import { historicalQuery } from "../history";
import {
  bikes,
  environment,
  incidents,
  parking,
  resolvePlace,
  roads,
  sourceHealth,
} from "../mobility";
import { findMobilityTool } from "../tool-registry";

/** Stored inspection never uses the MCP wrapper or its activation behavior.
 * Validators come from the shared registry; presenters keep their original defaults.
 * This internal result still requires the bounded safe DTO projection before HTTP.
 */
export async function inspectStored(value: unknown) {
  const request = dashboardInspectInput.parse(value);
  const definition = findMobilityTool(request.tool);
  if (!definition) throw new Error("Unknown tool");
  const input = definition.config.inputSchema.parse(request.input);
  const { tool } = request;
  const evaluatedAt = new Date().toISOString();
  if (tool === "plan_journey" || tool === "get_departures") {
    return {
      schemaVersion: 1 as const,
      tool,
      executionMode: "stored_only" as const,
      evaluatedAt,
      availability: "not_materialized" as const,
      result: null,
      limitations: [
        tool === "plan_journey"
          ? "Itineraries require an explicit OTP execution."
          : "Full departures require OTP. Retained RT evidence is not a complete departure result.",
      ],
    };
  }
  const result = await storedResult(tool, input);
  return {
    schemaVersion: 1 as const,
    tool,
    executionMode: "stored_only" as const,
    evaluatedAt,
    availability:
      "status" in result &&
      ["unavailable", "confirmation_required"].includes(String(result.status))
        ? ("unavailable" as const)
        : ("available" as const),
    result,
    limitations: [
      "Stored evidence only; inspect the result's per-product freshness and absence reasons.",
    ],
  };
}

// Closed dispatch: intentionally no fallback to the network-capable MCP executor.
async function storedResult(tool: string, input: unknown): Promise<object> {
  // Import the same exported contracts used by the registry, rather than a new
  // set of permissive inspector schemas.
  switch (tool) {
    case "resolve_place": {
      const i = schemas.resolvePlaceInputSchema.parse(input);
      return resolvePlace(i.query, i.limit, i.source, i.network);
    }
    case "resolve_address": {
      const i = schemas.resolveAddressInputSchema.parse(input);
      return resolveAddress(i.query, false);
    }
    case "get_emt_arrivals": {
      const i = schemas.emtArrivalsInputSchema.parse(input);
      return emtArrivals(i.placeId, i.limit, false);
    }
    case "get_crtm_timetable":
      return crtmTimetable(schemas.crtmTimetableInputSchema.parse(input));
    case "get_incidents":
      return incidents(schemas.incidentsInputSchema.parse(input), false);
    case "get_bike_availability":
      return bikes(schemas.bikesInputSchema.parse(input), false);
    case "get_environment":
      return environment(schemas.environmentInputSchema.parse(input), false);
    case "get_road_state":
      return roads(schemas.roadInputSchema.parse(input), false);
    case "get_parking":
      return parking(schemas.parkingInputSchema.parse(input), false);
    case "get_historical_state":
      return historicalQuery(schemas.historyInputSchema.parse(input));
    case "get_source_health":
      return sourceHealth(schemas.sourceHealthInputSchema.parse(input).source);
    case "get_line_status":
      return lineStatus(schemas.lineStatusInputSchema.parse(input));
    case "get_network_status":
      return networkStatus(
        schemas.networkStatusInputSchema.parse(input).source,
      );
    case "get_mobility_snapshot":
      return mobilitySnapshot(
        schemas.mobilitySnapshotInputSchema.parse(input).source,
      );
    default:
      throw new Error("No stored selector registered");
  }
}
