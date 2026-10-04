"use client";

import type { dashboardSourceResponse } from "@mobility/contracts";
import Link from "next/link";
import { useState } from "react";
import type { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useUi } from "@/i18n/provider";
import { useDashboard, useDashboardContext } from "@/src/dashboard-client";
import { sourceNames } from "./event-copy";
import { number } from "./insights";
import { Card, Segmented, Table } from "./primitives";
import { productLabel } from "./product-copy";
import type { DurationGroup } from "./refinement/core";
import { OperationDurationRows } from "./refinement/OperationDurationRows";
import { Instant, PageTitle, State, Technical } from "./shared";

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const list = (v: unknown) => (Array.isArray(v) ? v.map(obj) : []);
const names = sourceNames;
const operations: Record<string, string> = {
  publication: "Publication",
  refresh: "On-demand refresh",
  release: "Graph activation",
  lease_lost: "Lease lost",
  lease_recovered: "Lease recovered",
};
function SourcesContent({ id }: { id?: string }) {
  const { t, copy, numberLocale } = useUi();

  const [cursor, setCursor] = useState<string | null>(null);
  const [window, setWindow] = useState("24h"),
    [operation, setOperation] = useState("");
  const q = useDashboard(
    `${id ? `sources/${encodeURIComponent(id)}` : "sources"}?${new URLSearchParams({ window, ...(cursor ? { cursor } : {}), ...(operation ? { operation } : {}) })}`,
    15000,
    true,
  );
  const status = useDashboard("status", 3000);
  const ctx = useDashboardContext();
  const read = ctx.eligibility.get(
    `${id ? `sources/${encodeURIComponent(id)}` : "sources"}?${new URLSearchParams({ window, ...(cursor ? { cursor } : {}), ...(operation ? { operation } : {}) })}`,
  );
  const retryDisabled =
    ctx.paused ||
    q.isValidating ||
    Boolean(
      read && Date.now() < Math.max(read.at + 15000, read.retryUntil ?? 0),
    );
  const envelope = q.data as
    | z.infer<typeof dashboardSourceResponse>
    | undefined;
  const data = obj(envelope?.data),
    sources = envelope?.data.sources ?? [],
    metrics = obj(data.metrics);
  const selected = sources[0],
    streams = list(selected?.streams);
  return (
    <>
      <PageTitle
        title={id ? (names[id] ?? "Source detail") : t("overviewView.sources")}
        description={t(
          "sourceView.storedProviderEvidenceAndScopedOperationalSignals",
        )}
      />
      {q.error ? (
        <Alert className="dc-error">
          <AlertTitle>
            {q.data
              ? t("sourceView.cachedSourceEvidenceRefreshFailed")
              : t("sourceView.sourceEvidenceUnavailable")}
          </AlertTitle>
          <AlertDescription>
            <p>
              {t("sourceView.lastSuccessfulRead")}
              <Instant value={envelope?.readAt} />. Worker signals are
              independent.
            </p>
            <Button
              variant="outline"
              disabled={retryDisabled}
              onClick={() => void q.mutate()}
            >
              {t("sourceView.retrySourceRead")}
            </Button>
            <Technical
              value={{
                status: q.error.status,
                readAt: envelope?.readAt ?? null,
              }}
            />
          </AlertDescription>
        </Alert>
      ) : (
        <State data={q.data} loading={q.isLoading} error={null} />
      )}
      {cursor && q.error?.status === 409 ? (
        <Button variant="outline" onClick={() => setCursor(null)}>
          {t("sourceView.resourcesChangedReturnToFirstPage")}
        </Button>
      ) : null}
      {q.data ? (
        <>
          <div className="dc-toolbar">
            <Segmented
              label={t("sourceView.operationPeriod")}
              value={window}
              onChange={(v) => {
                setWindow(v);
                setCursor(null);
              }}
              options={[
                ["1h", t("commonFragments.hours1hour")],
                ["24h", t("commonFragments.hours24hours")],
                ["7d", t("presentation.days7")],
              ]}
            />
            <Segmented
              label={t("sourceView.operation")}
              value={operation}
              onChange={(v) => {
                setOperation(v);
                setCursor(null);
              }}
              options={[
                ["", t("activityView.all")],
                ...Object.entries(operations),
              ]}
            />
          </div>
          <section
            className="dc-stat-grid"
            aria-label={t("sourceView.sourceSummary")}
          >
            <article className="dc-stat">
              <h2>{t("sourceView.productsWithRecordedCurrentIssues")}</h2>
              <p className="dc-stat-value">
                {Array.isArray(metrics.issueProducts)
                  ? number(metrics.issueProducts.length, numberLocale)
                  : t("conversationView.unknown")}
                <span className="dc-value-unit">
                  {" "}
                  {t("commonFragments.of")}{" "}
                  {number(metrics.monitoredProducts, numberLocale)}{" "}
                  {t("commonFragments.monitored")}{" "}
                </span>
              </p>
              <p>
                {t(
                  "sourceView.recordedErrorsOrMissingWorkerSignalDuringAnActive",
                )}
              </p>
            </article>
            <article className="dc-stat">
              <h2>{t("sourceView.recordedErrorsInPeriod")}</h2>
              <p className="dc-stat-value">
                {number(metrics.errors, numberLocale)}
              </p>
              <p>
                {t("sourceView.uniqueRetainedErrorEventsNotAnAvailabilityRate")}{" "}
                <Link
                  href={`/dashboard/activity?${new URLSearchParams({ window, ...(id ? { source: id } : {}), severity: "error", ...(operation ? { type: operation } : {}) })}`}
                  className="underline"
                >
                  {t("sourceView.inspectActivity")}
                </Link>
              </p>
            </article>
          </section>
          {!id ? (
            <Card className="dc-table-card">
              <div className="dc-panel-heading dc-panel-heading-inset">
                <div>
                  <h2>{t("sourceView.sourceProducts")}</h2>
                  <p className="dc-meta">
                    {t(
                      "sourceView.registeredSourcesAndTheirPeriodicAndReferenceProductCounts",
                    )}
                  </p>
                </div>
              </div>
              {sources.length ? (
                <Table aria-label={t("sourceView.sourceProducts")}>
                  <thead>
                    <tr>
                      <th scope="col">{t("activityView.source")}</th>
                      <th scope="col">{t("sourceView.acquisition")}</th>
                      <th scope="col" className="numeric">
                        {t("sourceView.periodic")}
                      </th>
                      <th scope="col" className="numeric">
                        {t("insights.reference")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((source) => (
                      <tr key={String(source.id)}>
                        <td>
                          <Link
                            className="font-medium hover:underline"
                            href={`/dashboard/sources/${source.id}`}
                          >
                            {names[String(source.id)] ?? String(source.id)}
                          </Link>
                        </td>
                        <td>
                          <span
                            className="dc-status"
                            data-tone={source.enabled ? "neutral" : "muted"}
                          >
                            {source.enabled
                              ? t("shell.enabled")
                              : t("overviewView.disabled")}
                          </span>
                        </td>
                        <td className="numeric">
                          {list(source.streams).length}
                        </td>
                        <td className="numeric">
                          {list(source.staticFeed).length +
                            list(source.staticCatalogs).length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <p className="dc-meta dc-panel-heading-inset">
                  {t("sourceView.successfulReadNoRegisteredSourcesReturned")}
                </p>
              )}
            </Card>
          ) : (
            <>
              <Link href="/dashboard/sources" className="text-sm underline">
                {t("mobilityView.allSources")}
              </Link>
              <Card className="dc-table-card">
                <Table aria-label={t("sourceView.periodicProductDetails")}>
                  <thead>
                    <tr>
                      <th scope="col">{t("sourceView.periodicProduct")}</th>
                      <th scope="col">{t("sourceView.lastObservation")}</th>
                      <th scope="col">{t("sourceView.lastAttempt")}</th>
                      <th scope="col">
                        {t("sourceView.lastCompletedAttempt")}
                      </th>
                      <th scope="col">{t("sourceView.eligibleFrom")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streams.map((s) => (
                      <tr key={String(s.id)}>
                        <td>
                          <span
                            className="dc-status font-medium"
                            data-tone={
                              s.errorCode
                                ? "danger"
                                : s.state === "running"
                                  ? "neutral"
                                  : "muted"
                            }
                          >
                            {copy(productLabel(String(s.id)))}
                          </span>
                          <p className="dc-meta">
                            {s.errorCode
                              ? t(
                                  "sourceView.lastAttemptFailedPreviousEvidenceRetained",
                                )
                              : s.state === "running"
                                ? t("sourceView.operationInProgress")
                                : t(
                                    "sourceView.subjectToCadenceAndActivityWindow",
                                  )}
                          </p>
                        </td>
                        {(
                          [
                            "observedAt",
                            "lastAttemptAt",
                            "lastFinishedAt",
                            "nextDueAt",
                          ] as const
                        ).map((field) => (
                          <td key={field} className="dc-meta">
                            <Instant value={s[field]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {!streams.length ? (
                  <p className="dc-meta dc-panel-heading-inset">
                    {t(
                      "sourceView.noRegisteredPeriodicAcquisitionForThisSource",
                    )}
                  </p>
                ) : null}
              </Card>
              <p className="text-sm leading-6 text-muted-foreground">
                {t(
                  "sourceView.eligibilityDoesNotPromiseANewObservationTimeLast",
                )}
              </p>
              {[
                [
                  t("sourceView.onDemandWeatherResources"),
                  list(data.resources),
                ],
                [t("sourceView.queriedEmtStops"), list(data.arrivals)],
                [
                  t("sourceView.referenceCatalogs"),
                  [
                    ...list(selected?.staticFeed),
                    ...list(selected?.staticCatalogs),
                  ],
                ],
              ].map(([label, items], groupIndex) => (
                <section
                  key={["weather", "transport", "reference"][groupIndex]}
                  className="rounded-lg border bg-card p-5"
                >
                  <h2 className="text-base font-semibold">{String(label)}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("sourceView.upTo50ResourcesPerPageNotAGlobal")}
                  </p>
                  {(items as Record<string, unknown>[]).length ? (
                    <div className="mt-4 flex flex-col divide-y">
                      {(items as Record<string, unknown>[]).map((r) => (
                        <div key={String(r.id)} className="py-3 text-sm">
                          <p className="font-medium">
                            {String(
                              r.label ??
                                (obj(data.resourcePage).kind === "arrivals"
                                  ? `EMT stop ${r.id}`
                                  : t("sourceView.publishedCatalog")),
                            )}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("sourceView.publishedObserved")}{" "}
                            <Instant value={r.issuedAt ?? r.observedAt} />{" "}
                            {t("inspectionResult.ingested")}{" "}
                            <Instant
                              value={
                                r.importedAt ?? r.fetchedAt ?? r.ingestedAt
                              }
                            />
                          </p>
                          {r.ageBasis ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t("sourceView.dailyAgeEvaluationBasis")}{" "}
                              <Instant value={r.ageBasis} />. Not a verified
                              publication time.
                            </p>
                          ) : null}
                          {r.checkedAt ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t("sourceView.checked")}
                              <Instant value={r.checkedAt} />. Validity:{" "}
                              <Instant value={r.validFrom} /> —{" "}
                              <Instant value={r.validTo} />.
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs">
                            {r.errorCode
                              ? t(
                                  "sourceView.lastAttemptFailedInspectActivityAndTimes",
                                )
                              : t(
                                  "sourceView.publishedValidityAndLimitsPreserved",
                                )}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {t("sourceView.noStoredResourcesInThisGroupThisDoesNot")}
                    </p>
                  )}
                </section>
              ))}
            </>
          )}
          {id ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                {number(obj(data.resourcePage).returned, numberLocale)}{" "}
                {t("commonFragments.of")}{" "}
                {number(obj(data.resourcePage).total, numberLocale)}{" "}
                {t("sourceView.resourcesOf")}{" "}
                {obj(data.resourcePage).kind === "arrivals"
                  ? t("sourceView.queriedStops")
                  : "weather"}
                .
              </span>
              {typeof obj(data.resourcePage).nextCursor === "string" ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    setCursor(String(obj(data.resourcePage).nextCursor))
                  }
                >
                  {t("sourceView.nextResourcePage")}
                </Button>
              ) : null}
              {cursor ? (
                <Button variant="ghost" onClick={() => setCursor(null)}>
                  {t("sourceView.firstResourcePage")}
                </Button>
              ) : null}
            </div>
          ) : null}
          <Card>
            <h2>{t("sourceView.recordedOperationDurations")}</h2>
            <p className="dc-meta">
              {t("sourceView.medianWithAvailableSamplesP95WithAtLeast20")}
            </p>
            <OperationDurationRows
              groups={list(metrics.durations).map(
                (r) =>
                  ({
                    component: String(r.component),
                    operation: String(r.operation),
                    n: typeof r.n === "number" ? r.n : NaN,
                    medianMs:
                      typeof r.medianMs === "number" ? r.medianMs : null,
                    p95Ms: typeof r.p95Ms === "number" ? r.p95Ms : null,
                  }) satisfies DurationGroup,
              )}
            />
          </Card>
          <p className="text-xs text-muted-foreground">
            {t("sourceView.bestEffortCapture")}
            <Instant value={metrics.from} /> — <Instant value={metrics.to} />
          </p>
          <Technical value={data} />
        </>
      ) : null}
      <Card>
        <div className="dc-panel-heading">
          <div>
            <h2 id="worker-signals">{t("sourceView.workerSignals")}</h2>
            <p className="dc-meta">
              {t("sourceView.notProviderHealthOrFreshnessEvidence")}
            </p>
          </div>
        </div>
        <State
          data={status.data}
          loading={status.isLoading}
          error={status.error}
        />
        <ul className="dc-worker-list">
          {list(obj(status.data).workers).map((w) => (
            <li key={String(w.id)}>
              <span className="dc-worker-name">{`Worker ${Number(w.id) + 1}`}</span>
              <span
                className="dc-status"
                data-tone={
                  w.state === "running"
                    ? "neutral"
                    : w.state === "stopped_or_unreachable"
                      ? "warning"
                      : "muted"
                }
              >
                {(
                  {
                    running: t("sourceView.activeSignal"),
                    disabled: t("overviewView.disabled"),
                    not_seen: t("sourceView.noRecordedSignal"),
                    stopped_or_unreachable: t("sourceView.noRecentSignal"),
                    inactive_window: t("sourceView.inactiveWindow"),
                  } as Record<string, string>
                )[String(w.state)] ?? "State not confirmed"}
              </span>
              <span className="dc-meta">
                {t("sourceView.lastSignal")}
                <Instant value={w.lastSeenAt} />
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

export function Sources({ id }: { id?: string }) {
  return <SourcesContent key={id ?? "all"} {...(id ? { id } : {})} />;
}
