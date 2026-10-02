/** Public DTO vocabulary. Unknown keys are omitted, never copied by spread. */
const allowed = new Set(
  `schemaVersion readAt status reason warning coverage limitations tool executionMode evaluatedAt availability result source sources sourceId productId id name label kind category type title description text value unit units measurements latitude longitude coordinates geometry observedAt ingestedAt checkedAt issuedAt issuedAtRaw validFrom validTo horizon freshness ageSeconds maxAgeSeconds thresholdSeconds quality version staticVersion attribution licence termsUrl provider fetchedAt retainedBytes originalBytes truncated redacted captureStatus captureCoverage captureVersion count total fresh stale unavailable missing unknown partial currentDay referenceDate importedAt serviceStart serviceEnd enabled activeUntil activityWindow workers state lastSeenAt lastPrunedAt lastAttemptAt lastSuccessAt lastFinishedAt errorCode errorStage durationMs nextDueAt nextAllowedAt nextEligibleAt leaseUntil failures attempts recoveredLeases products streams capability liveDataReady provenance provenanceScope stations sensors readings parkings places incidents alerts arrivals departures routes itineraries legs start end from to scheduledTime estimatedTime estimatedArrivalAt estimateSecondsAtObservation remainingSeconds bikes docks capacity isInstalled isRenting isReturning line lineId lines routeId routeIds routeIdsResolved destination direction headsign time distanceMeters walkingDuration transfers serviceDate network stopId placeId originId destinationId query limit modes preferences maxWalkingMinutes maxTransfers wheelchair allowExternal price tariff currency durationMinutes date vehicleType parkingId pollutant stationId weatherProduct fromTime toTime minutesAgo at mode sourceVersion identities accessibility accessibilityContext wheelchairBoarding wheelchairAccessible declarations inherited accessibilityStatus boarding alighting vehicle ref refs periods alternatives evidence prediction resources nextCursor limited countScope data events sessionId createdAt expiresAt lastActivityAt turnId stepIndex sequence purpose attemptId callId providerResponseId isError inputTokens outputTokens cachedInputTokens reasoningTokens usage payloadIds sentCallIds eventKey occurredAt recordedAt operationId component eventType severity outcome completedAt deadlineAt leaseUntil requestId input hash eventCount omittedEvents knownGaps captureStartedAt firstObservedAt lastObservedAt captureVersion enabled counts totals freshnessBase timestamp readTime retained content capture state cities municipality municipalityCode municipalityName warnings forecast period sky precipitation temperature wind pressure humidity amount speed occupancy flow dataType samplingPoint error refresh inProgress basis ambiguous requiresConfirmation externalRequest cached sourceUrl memberships stop catalog detail components asOf readCompletedAt temporalScope scope summary freshnessScope entityCoverage staticFeed staticCatalogs stopCatalog realtime routingCoverage arrivalsCoverage lastDurationSeconds execution lane strategy freshnessSeconds globalCooldownSeconds currentServiceEnvelope source_id service_start service_end fetched_at imported_at dataset_id wheelchairCount lineIdentity requested namespace serviceStatus notices staticCatalog departureTime scheduledDeparture estimatedDeparture cancelled skipped basis vehicleId scheduledArrival estimatedArrival stopRealtimeStatus realtimeStatus departureBasis arrivalBasis coordinatesAreEstimates period durationSeconds entityCount oldestObservedAt newestObservedAt missingTime observedCount`.split(
    /\s+/,
  ),
);
const forbidden =
  /(?:authorization|cookie|password|secret|token|encrypted|reasoning|headers|object_key|auth_user|email|signed|manifest|endpoint)/i;
export type SafeData =
  | null
  | boolean
  | number
  | string
  | SafeData[]
  | { [key: string]: SafeData };
export function redactText(value: string) {
  return value
    .replace(/\b(?:Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(
      /\b(?:sk-|sk_proj_|sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{8,}/g,
      "[redacted]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[redacted]",
    )
    .replace(
      /((?:password|secret|api[_-]?key|authorization|token)\s*[=:]\s*)[^\s,;"}]+/gi,
      "$1[redacted]",
    )
    .replace(/https?:\/\/[^\s"<>]+/g, (url) => {
      try {
        const u = new URL(url);
        return u.username || u.password || u.search ? "[redacted URL]" : url;
      } catch {
        return "[redacted URL]";
      }
    });
}
export function safeProjection(
  value: unknown,
  maxBytes = 32000,
  inputKeys: readonly string[] = [],
) {
  let redacted = false,
    truncated = false,
    nodes = 0;
  const keys = new Set([...allowed, ...inputKeys]);
  const project = (v: unknown, depth: number): SafeData => {
    if (++nodes > 10000 || depth > 10) {
      truncated = true;
      return null;
    }
    if (v === null || typeof v === "boolean") return v;
    if (v instanceof Date)
      return Number.isFinite(v.getTime()) ? v.toISOString() : null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
      if (/^\s*[[{]/.test(v)) {
        try {
          return JSON.stringify(project(JSON.parse(v), depth + 1));
        } catch {}
      }
      const text = redactText(v);
      redacted ||= text !== v;
      if (text.length > 8192) {
        truncated = true;
        return `${text.slice(0, 8192)} [omitted]`;
      }
      return text;
    }
    if (Array.isArray(v)) {
      if (v.length > 1000) truncated = true;
      return v.slice(0, 1000).map((item) => project(item, depth + 1));
    }
    if (v && typeof v === "object") {
      const out: Record<string, SafeData> = {};
      for (const [k, item] of Object.entries(v)) {
        // Token counters are public numbers, not bearer tokens.
        if (
          !keys.has(k) ||
          (forbidden.test(k) &&
            ![
              "inputTokens",
              "outputTokens",
              "cachedInputTokens",
              "reasoningTokens",
            ].includes(k))
        ) {
          redacted = true;
          continue;
        }
        out[k] = project(item, depth + 1);
      }
      return out;
    }
    return null;
  };
  let data = project(value, 0);
  let text = JSON.stringify(data);
  if (new TextEncoder().encode(text).length > maxBytes) {
    // Keep valid JSON. No byte slice through a serialized tree.
    truncated = true;
    if (Array.isArray(data)) {
      while (
        data.length &&
        new TextEncoder().encode(JSON.stringify(data)).length > maxBytes
      )
        data.pop();
    } else if (data && typeof data === "object") {
      for (const k of Object.keys(data).reverse()) {
        if (new TextEncoder().encode(JSON.stringify(data)).length <= maxBytes)
          break;
        delete data[k];
      }
    } else {
      data = null;
    }
    text = JSON.stringify(data);
  }
  return {
    data,
    retainedBytes: new TextEncoder().encode(text).length,
    redacted,
    truncated,
  };
}
