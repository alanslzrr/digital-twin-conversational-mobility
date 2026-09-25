import type { JourneyRequest } from "@mobility/contracts";

// Walking access to transit does not imply permission for walking-only routes.
export function journeyModePolicy(modes: JourneyRequest["modes"]) {
  if (
    !modes.length ||
    modes.some((mode) => mode !== "WALK" && mode !== "TRANSIT")
  )
    return null;
  return {
    allowTransit: modes.includes("TRANSIT"),
    allowWalkingOnly: modes.includes("WALK"),
  };
}
