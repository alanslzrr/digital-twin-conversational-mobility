"use client";
import type { DashboardOverview } from "@mobility/contracts";
import Link from "next/link";
import { useState } from "react";
import { useDashboard } from "@/src/dashboard-client";
import { eventOutcomes, eventTypes } from "./event-copy";
import { MetricStrip, number } from "./insights";
import { Card, Segmented } from "./primitives";
import { Instant, PageTitle, State } from "./shared";
export function Overview() {
  const [window, setWindow] = useState("24h");
  const [parkingCategory, setParkingCategory] = useState("");
  const q = useDashboard(
    `overview?${new URLSearchParams({ window, ...(parkingCategory ? { parkingCategory } : {}) })}`,
    15000,
    true,
  );
  const data = q.data as DashboardOverview | undefined;
  return (
    <>
      <PageTitle
        title="Overview"
        description="Stored mobility evidence at a glance."
      />
      <State data={q.data} loading={q.isLoading} error={q.error} />
      {data ? (
        <>
          <MetricStrip metrics={data.metrics} />
          {data.parkingCategories.length > 1 ? (
            <div className="dc-toolbar">
              <label htmlFor="overview-parking-category">
                Parking category
              </label>
              <select
                id="overview-parking-category"
                value={data.parkingCategory ?? ""}
                onChange={(e) => setParkingCategory(e.target.value)}
              >
                {data.parkingCategories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label} ({c.code})
                  </option>
                ))}
              </select>
              <span className="dc-meta">Only this category is summed.</span>
            </div>
          ) : null}
          <div className="dc-overview-grid">
            <Card>
              <div className="dc-panel-heading">
                <h2>Product readiness</h2>
                <Link href="/dashboard/sources" className="dc-link">
                  Sources
                </Link>
              </div>
              <p className="dc-meta">
                Readiness of observed products, not citywide coverage.
              </p>
              {["periodic", "demand"].map((mode) => (
                <div key={mode}>
                  <h3 className="dc-group-title">
                    {mode === "periodic"
                      ? "Periodic evidence"
                      : "On-demand evidence"}
                  </h3>
                  {data.products
                    .filter((p) => p.mode === mode)
                    .map((p) => (
                      <div key={p.id} className="dc-readiness-row">
                        <Link
                          href={`/dashboard/mobility?section=dynamic&category=${p.category}&product=${encodeURIComponent(p.id)}`}
                          className="hover:underline"
                        >
                          {p.label}
                        </Link>
                        <span
                          className={
                            !p.enabled
                              ? "dc-meta"
                              : p.usable
                                ? "dc-state-positive"
                                : "dc-state-warning"
                          }
                        >
                          {!p.enabled
                            ? "Disabled"
                            : p.usable
                              ? "Usable evidence"
                              : "Needs evidence"}
                        </span>
                        <span className="dc-meta">
                          {p.total === null
                            ? "Count unavailable"
                            : `${number(p.total)} ${p.unit}`}
                          {p.issue ? ` · ${p.issue}` : ""}
                        </span>
                      </div>
                    ))}
                </div>
              ))}
              <Link
                href="/dashboard/mobility?section=reference&category=places"
                className="dc-link mt-3"
              >
                Browse reference catalogs
              </Link>
            </Card>
            <div className="dc-stack">
              <Card>
                <h2>Needs attention</h2>
                {data.attention.length ? (
                  <ul className="mt-3 divide-y">
                    {data.attention.slice(0, 3).map((a) => (
                      <li key={a.href + a.label} className="py-3">
                        <p>{a.label}</p>
                        <Link href={a.href} className="dc-link">
                          Inspect evidence
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dc-meta mt-3">
                    No issues detected in available signals. This is not a
                    universal guarantee.
                  </p>
                )}
              </Card>
              <Card>
                <div className="dc-panel-heading">
                  <h2>Recent activity</h2>
                  <Link
                    href={`/dashboard/activity?window=${window}`}
                    className="dc-link"
                  >
                    View all
                  </Link>
                </div>
                <Segmented
                  label="Recent activity period"
                  value={window}
                  onChange={setWindow}
                  options={[
                    ["1h", "1 hour"],
                    ["24h", "24 hours"],
                    ["7d", "7 days"],
                  ]}
                />
                {data.recentEvents.length ? (
                  <ul className="divide-y mt-3">
                    {data.recentEvents.slice(0, 5).map((e) => (
                      <li key={e.id} className="py-3">
                        <Link
                          href={`/dashboard/activity/${e.id}`}
                          className="hover:underline"
                        >
                          {eventTypes[e.type]} · {e.source}
                        </Link>
                        <p className="dc-meta">
                          {eventOutcomes[e.outcome]} ·{" "}
                          <Instant value={e.occurredAt} />
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dc-meta mt-3">
                    No events captured in this period.
                  </p>
                )}
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
