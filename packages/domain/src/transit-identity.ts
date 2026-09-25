// Alias rules are operator-specific. Do not erase branch suffixes or EMT zeros.
export function normalizeLine(operator: "renfe" | "emt", value: string) {
  const name = value.trim().toUpperCase();
  return operator === "renfe"
    ? name.replace(/^C\s*-?\s*(\d+[A-Z]?)$/, "C$1")
    : name;
}

export function resolveLine(
  operator: "renfe" | "emt",
  query: string,
  routes: ReadonlyArray<{ id: string; name: string }>,
) {
  const normalized = normalizeLine(operator, query);
  const matches = routes.filter(
    (route) => normalizeLine(operator, route.name) === normalized,
  );
  return {
    requested: query,
    normalized,
    status: matches.length
      ? ("known" as const)
      : routes.length
        ? ("unknown" as const)
        : ("catalog_unavailable" as const),
    routeIds: matches.map((route) => route.id),
  };
}

type StopTime = {
  stop_id: string;
  stop_sequence: string;
  stop_headsign?: string;
};
export type DestinationEvidence = {
  terminal: { id: string; name: string } | null;
  stopHeadsigns: Record<string, string>;
};

// Call only with ALL stop_times for this trip from the same feed. An old export
// without stop_times cannot establish a terminal and deliberately returns null.
export function deriveDestinationEvidence(
  times: readonly StopTime[] | undefined,
  stops: ReadonlyMap<string, string>,
): DestinationEvidence {
  const unknown = { terminal: null, stopHeadsigns: {} };
  if (!times || times.length < 2) return unknown;
  const ordered = [...times].sort(
    (a, b) => Number(a.stop_sequence) - Number(b.stop_sequence),
  );
  const sequences = times.map((time) => Number(time.stop_sequence));
  if (
    times.some(
      (time) => !time.stop_sequence.trim() || !stops.get(time.stop_id)?.trim(),
    ) ||
    sequences.some((n) => !Number.isSafeInteger(n) || n < 0) ||
    new Set(sequences).size !== times.length
  )
    return unknown;
  const counts = new Map<string, number>();
  for (const time of times)
    counts.set(time.stop_id, (counts.get(time.stop_id) ?? 0) + 1);
  // Repeated stops can have different directions/headsigns: no stop-only inference.
  const stopHeadsigns = Object.fromEntries(
    times.flatMap((time) =>
      counts.get(time.stop_id) === 1 && time.stop_headsign?.trim()
        ? [[time.stop_id, time.stop_headsign.trim()]]
        : [],
    ),
  );
  const last = ordered.at(-1);
  const first = ordered[0];
  return {
    terminal:
      last && first && counts.get(last.stop_id) === 1
        ? { id: last.stop_id, name: stops.get(last.stop_id)?.trim() ?? "" }
        : null,
    stopHeadsigns,
  };
}

// Renfe uses CIVIS as a service class in trip_headsign, not as a destination.
function destinationHeadsign(value: string | null | undefined) {
  const text = value?.trim();
  return text && !/^C[IÍ]VIS$/i.test(text) ? text : null;
}

export function tripDestination(
  tripHeadsign: string | null | undefined,
  evidence: DestinationEvidence | null | undefined,
  atStop: string,
) {
  const stopHeadsign =
    evidence && Object.hasOwn(evidence.stopHeadsigns, atStop)
      ? evidence.stopHeadsigns[atStop]?.trim()
      : undefined;
  if (destinationHeadsign(stopHeadsign))
    return {
      name: destinationHeadsign(stopHeadsign),
      basis: "stop_headsign" as const,
    };
  const tripName = destinationHeadsign(tripHeadsign);
  if (tripName) return { name: tripName, basis: "trip_headsign" as const };
  if (evidence?.terminal && evidence.terminal.id !== atStop)
    return { name: evidence.terminal.name, basis: "derived_terminal" as const };
  return { name: null, basis: "unknown" as const };
}
