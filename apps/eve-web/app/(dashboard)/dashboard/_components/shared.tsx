"use client";
import { Spinner } from "@/components/ui/spinner";
import { readState } from "@/src/dashboard-presentation";
import { Skeleton } from "./primitives";
import { RefinedDisclosure } from "./refinement/RefinedDisclosure";
export function Instant({
  value,
  compact = false,
}: {
  value: unknown;
  compact?: boolean;
}) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return <span>Unavailable</span>;
  return (
    <time dateTime={value} title={value}>
      {new Date(value)[compact ? "toLocaleTimeString" : "toLocaleString"](
        "en-GB",
        {
          timeZone: "Europe/Madrid",
          timeZoneName: "short",
        },
      )}
    </time>
  );
}
export function Technical({ value }: { value: unknown }) {
  return (
    <RefinedDisclosure title="Sanitized technical details">
      <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-5">
        {JSON.stringify(value, null, 2)}
      </pre>
    </RefinedDisclosure>
  );
}
export function State({
  loading,
  error,
  empty,
  data,
}: {
  loading: boolean;
  error: unknown;
  empty?: boolean;
  data?: unknown;
}) {
  const state = readState(data, loading, error);
  return (
    <>
      {loading && !data ? (
        <div role="status" className="dc-stack">
          <span className="flex gap-2 items-center">
            <Spinner />
            Loading stored data…
          </span>
          <Skeleton />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="dc-card dc-error">
          {state === "cached_failure"
            ? "Refresh failed. Previously loaded evidence remains at its original successful read time."
            : "Unable to load stored data. This is not an empty result."}
        </p>
      ) : null}
      {!loading && !error && empty ? (
        <p className="dc-card">No stored records for this selection.</p>
      ) : null}
    </>
  );
}
export function PageTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="dc-page-heading">
      <h1 className="dc-page-title">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
export const publicLabel = (key: string) =>
  (
    ({
      vehiclesPerHour: "Traffic intensity",
      occupancyPercent: "Sensor occupancy",
      loadPercent: "Sensor load",
      serviceLevel: "Published service level",
      maximumEur: "Documented maximum (EUR)",
      publishedDate: "Document checked (date)",
      effectiveFrom: "Effective from",
      arrivalSeconds: "Published timetable arrival",
      departureSeconds: "Published timetable departure",
      calendarId: "Published calendar",
      wheelchair: "Declared wheelchair accessibility",
      kind: "Place kind",
      bikes: "Available bikes",
      docks: "Available docks",
      freeSpaces: "Published free spaces",
      category: "Published category",
      installed: "Installed station",
      renting: "Rental enabled",
      returning: "Return enabled",
      temperature: "Temperature",
      precipitation: "Accumulated precipitation",
      precipitation_probability: "Precipitation probability",
      wind: "Wind",
      gust: "Wind gust",
      sky: "Sky conditions",
      basis: "Measurement basis",
      period: "Published period",
      line: "Line",
      destination: "Destination",
      estimateSecondsAtObservation: "Estimate at observation (s)",
      observedAt: "Observed",
      startsAt: "Validity starts",
      endsAt: "Validity ends",
      detail: "Published description",
      road: "Road",
      providerValidity: "Published validity",
      status: "State",
      components: "Components",
      staticFeed: "Static calendar",
      staticCatalogs: "Static catalogs",
      leaseUntil: "Lease until",
      tool: "Tool",
      executionMode: "Query mode",
      evaluatedAt: "Evaluated",
      requestId: "Request ID",
      truncated: "Truncated",
      input: "Input",
      result: "Outcome",
      workers: "Workers",
      products: "Products",
      streams: "Streams",
      sources: "Sources",
      resources: "Resources",
      arrivals: "EMT arrivals",
      routes: "Routing versions",
      ingestionEnabled: "Ingestion enabled",
      activeUntil: "Activity window",
      captureVersion: "Capture version",
      captureCoverage: "Capture coverage",
      readAt: "View read",
      ingestedAt: "Ingested",
      checkedAt: "Checked",
      issuedAt: "Issued",
      validFrom: "Valid from",
      validTo: "Valid to",
      lastSeenAt: "Last signal",
      lastPrunedAt: "Last pruning",
      state: "State",
      name: "Name",
      source: "Source",
      sourceId: "Source",
      productId: "Product",
      freshness: "Freshness",
      coverage: "Coverage",
      version: "Version",
      lastAttemptAt: "Last attempt",
      lastSuccessAt: "Last success",
      nextDueAt: "Next eligible attempt",
      errorCode: "Error code",
      errorStage: "Error stage",
      reason: "Reason",
      limitations: "Limits",
      retainedBytes: "Retained bytes",
      eventCount: "Retained events",
      knownGaps: "Known gaps",
      omittedEvents: "Omitted events",
      counts: "Counts",
      usage: "Reported tokens",
      inputTokens: "Input",
      outputTokens: "Output",
      cachedInputTokens: "Cached input",
      durationMs: "Duration (ms)",
      warning: "Interpretation limits",
      count: "Count",
      total: "Total",
      fresh: "Recent",
      stale: "Stale",
      unavailable: "Unavailable",
      enabled: "Enabled",
      failures: "Failures",
      attempts: "Attempts",
      createdAt: "Created",
      expiresAt: "Expires",
      completedAt: "Completed",
      isError: "Error",
      lastActivityAt: "Last activity",
      captureStatus: "Capture state",
      captureStartedAt: "Capture begins",
      firstObservedAt: "First signal",
      lastObservedAt: "Last signal",
      schemaVersion: "Contract version",
    }) as Record<string, string>
  )[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2");
export function ObjectCards({ value }: { value: unknown }) {
  const entries =
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value)
      : [];
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries
        .filter(
          ([k, v]) =>
            k !== "schemaVersion" && (typeof v !== "object" || v === null),
        )
        .map(([k, v]) => (
          <div key={k} className="rounded-lg border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{publicLabel(k)}</dt>
            <dd className="mt-2 break-words text-sm font-medium">
              {v === null ? (
                "Unavailable"
              ) : typeof v === "boolean" ? (
                v ? (
                  "Yes"
                ) : (
                  "No"
                )
              ) : typeof v === "string" && /^(?:\d{4}-\d\d-\d\dT)/.test(v) ? (
                <Instant value={v} />
              ) : typeof v === "string" ? (
                ((
                  {
                    best_effort: "Best-effort capture",
                    partial: "Partial",
                    unknown: "Unknown",
                    disabled: "Disabled",
                    running: "Running",
                    recent: "Recent",
                    stale: "Stale",
                    static: "Static/versioned",
                    unavailable: "Unavailable",
                    not_instrumented: "Not instrumented in this period",
                  } as Record<string, string>
                )[v] ?? v)
              ) : (
                String(v)
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}
