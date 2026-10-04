"use client";
import type { dashboardSourceResponse } from "@mobility/contracts";
import Link from "next/link";
import { useState } from "react";
import type { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
        title={id ? (names[id] ?? "Source detail") : "Sources"}
        description="Stored provider evidence and scoped operational signals."
      />
      {q.error ? (
        <Alert className="dc-error">
          <AlertTitle>
            {q.data
              ? "Cached source evidence · refresh failed"
              : "Source evidence unavailable"}
          </AlertTitle>
          <AlertDescription>
            <p>
              Last successful read: <Instant value={envelope?.readAt} />. Worker
              signals are independent.
            </p>
            <Button
              variant="outline"
              disabled={retryDisabled}
              onClick={() => void q.mutate()}
            >
              Retry source read
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
          Resources changed: return to first page
        </Button>
      ) : null}
      {q.data ? (
        <>
          <div className="dc-toolbar">
            <Segmented
              label="Operation period"
              value={window}
              onChange={(v) => {
                setWindow(v);
                setCursor(null);
              }}
              options={[
                ["1h", "1 hour"],
                ["24h", "24 hours"],
                ["7d", "7 days"],
              ]}
            />
            <Segmented
              label="Operation"
              value={operation}
              onChange={(v) => {
                setOperation(v);
                setCursor(null);
              }}
              options={[["", "All"], ...Object.entries(operations)]}
            />
          </div>
          <section className="dc-stat-grid" aria-label="Source summary">
            <article className="dc-stat">
              <h2>Products with recorded current issues</h2>
              <p className="dc-stat-value">
                {Array.isArray(metrics.issueProducts)
                  ? number(metrics.issueProducts.length)
                  : "Unknown"}
                <span className="dc-value-unit">
                  {" "}
                  of {number(metrics.monitoredProducts)} monitored
                </span>
              </p>
              <p>
                Recorded errors or missing worker signal during an active
                window. Normal absence of demand or an inactive window is not a
                failure.
              </p>
            </article>
            <article className="dc-stat">
              <h2>Recorded errors in period</h2>
              <p className="dc-stat-value">{number(metrics.errors)}</p>
              <p>
                Unique retained error events, not an availability rate.{" "}
                <Link
                  href={`/dashboard/activity?${new URLSearchParams({ window, ...(id ? { source: id } : {}), severity: "error", ...(operation ? { type: operation } : {}) })}`}
                  className="underline"
                >
                  Inspect activity
                </Link>
              </p>
            </article>
          </section>
          {!id ? (
            <Card className="dc-table-card">
              <div className="dc-panel-heading dc-panel-heading-inset">
                <div>
                  <h2>Source products</h2>
                  <p className="dc-meta">
                    Registered sources and their periodic and reference product
                    counts. Enabled does not mean recent.
                  </p>
                </div>
              </div>
              {sources.length ? (
                <Table aria-label="Source products">
                  <thead>
                    <tr>
                      <th scope="col">Source</th>
                      <th scope="col">Acquisition</th>
                      <th scope="col" className="numeric">
                        Periodic
                      </th>
                      <th scope="col" className="numeric">
                        Reference
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
                            {source.enabled ? "Enabled" : "Disabled"}
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
                  Successful read: no registered sources returned.
                </p>
              )}
            </Card>
          ) : (
            <>
              <Link href="/dashboard/sources" className="text-sm underline">
                All sources
              </Link>
              <Card className="dc-table-card">
                <Table aria-label="Periodic product details">
                  <thead>
                    <tr>
                      <th scope="col">Periodic product</th>
                      <th scope="col">Last observation</th>
                      <th scope="col">Last attempt</th>
                      <th scope="col">Last completed attempt</th>
                      <th scope="col">Eligible from</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streams.map((s) => (
                      <tr key={productLabel(String(s.id))}>
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
                            {productLabel(String(s.id))}
                          </span>
                          <p className="dc-meta">
                            {s.errorCode
                              ? "Last attempt failed; previous evidence retained."
                              : s.state === "running"
                                ? "Operation in progress"
                                : "Subject to cadence and activity window"}
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
                    No registered periodic acquisition for this source.
                  </p>
                ) : null}
              </Card>
              <p className="text-sm leading-6 text-muted-foreground">
                Eligibility does not promise a new observation time. Last
                completed attempt is not last success. No ingestion restart
                controls are exposed.
              </p>
              {[
                ["On-demand weather resources", list(data.resources)],
                ["Queried EMT stops", list(data.arrivals)],
                [
                  "Reference catalogs",
                  [
                    ...list(selected?.staticFeed),
                    ...list(selected?.staticCatalogs),
                  ],
                ],
              ].map(([label, items]) => (
                <section
                  key={String(label)}
                  className="rounded-lg border bg-card p-5"
                >
                  <h2 className="text-base font-semibold">{String(label)}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Up to 50 resources per page, not a global total or
                    territorial coverage guarantee.
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
                                  : "Published catalog"),
                            )}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Published/observed:{" "}
                            <Instant value={r.issuedAt ?? r.observedAt} /> ·
                            Ingested:{" "}
                            <Instant
                              value={
                                r.importedAt ?? r.fetchedAt ?? r.ingestedAt
                              }
                            />
                          </p>
                          {r.ageBasis ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Daily age evaluation basis:{" "}
                              <Instant value={r.ageBasis} />. Not a verified
                              publication time.
                            </p>
                          ) : null}
                          {r.checkedAt ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Checked: <Instant value={r.checkedAt} />.
                              Validity: <Instant value={r.validFrom} /> —{" "}
                              <Instant value={r.validTo} />.
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs">
                            {r.errorCode
                              ? "Last attempt failed; inspect activity and times."
                              : "Published validity and limits preserved."}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No stored resources in this group. This does not imply a
                      provider outage.
                    </p>
                  )}
                </section>
              ))}
            </>
          )}
          {id ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                {number(obj(data.resourcePage).returned)} of{" "}
                {number(obj(data.resourcePage).total)} resources of{" "}
                {obj(data.resourcePage).kind === "arrivals"
                  ? "queried stops"
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
                  Next resource page
                </Button>
              ) : null}
              {cursor ? (
                <Button variant="ghost" onClick={() => setCursor(null)}>
                  First resource page
                </Button>
              ) : null}
            </div>
          ) : null}
          <Card>
            <h2>Recorded operation durations</h2>
            <p className="dc-meta">
              Median with available samples; p95 with at least 20. Not provider
              HTTP latency.
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
            Best-effort capture · <Instant value={metrics.from} /> —{" "}
            <Instant value={metrics.to} />
          </p>
          <Technical value={data} />
        </>
      ) : null}
      <Card>
        <div className="dc-panel-heading">
          <div>
            <h2 id="worker-signals">Worker signals</h2>
            <p className="dc-meta">
              Not provider health or freshness evidence.
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
                    running: "Active signal",
                    disabled: "Disabled",
                    not_seen: "No recorded signal",
                    stopped_or_unreachable: "No recent signal",
                    inactive_window: "Inactive window",
                  } as Record<string, string>
                )[String(w.state)] ?? "State not confirmed"}
              </span>
              <span className="dc-meta">
                Last signal <Instant value={w.lastSeenAt} />
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
