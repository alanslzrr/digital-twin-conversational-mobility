"use client";
import type { DashboardOverview } from "@mobility/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useDashboard, useDashboardContext } from "@/src/dashboard-client";
import {
  eventOutcomes,
  eventTypes,
  outcomeTones,
  sourceNames,
} from "./event-copy";
import { ActivityPreview, MetricStrip } from "./insights";
import { Card, Segmented } from "./primitives";
import { productLabel, productUnit } from "./product-copy";
import { FreshnessBar } from "./refinement/FreshnessGraphic";
import { ProductUnits } from "./refinement/ProductUnits";
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
  const ctx = useDashboardContext();
  const scope = `${ctx.identity.principalId}:${window}:${parkingCategory}`;
  const [pair, setPair] = useState<{
    scope: string;
    current: DashboardOverview;
    previous: DashboardOverview | null;
  } | null>(null);
  useEffect(() => {
    if (ctx.paused || q.error) {
      setPair(null);
      return;
    }
    if (!data) return;
    setPair((old) => {
      if (old?.scope === scope && old.current.readAt === data.readAt)
        return old;
      if (
        old?.scope === scope &&
        Date.parse(data.readAt) < Date.parse(old.current.readAt)
      )
        return old;
      return {
        scope,
        current: data,
        previous: old?.scope === scope ? old.current : null,
      };
    });
  }, [data, scope, ctx.paused, q.error]);
  return (
    <>
      <div className="dc-overview-heading">
        <PageTitle
          title="Overview"
          description="Stored mobility evidence at a glance."
        />{" "}
        {data && data.parkingCategories.length > 1 ? (
          <div className="dc-toolbar dc-inline-field">
            <label htmlFor="overview-parking-category">Parking category</label>
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
      </div>
      <State data={q.data} loading={q.isLoading} error={q.error} />
      {data ? (
        <>
          <MetricStrip
            metrics={data.metrics}
            previous={
              !q.error &&
              !ctx.paused &&
              pair?.scope === scope &&
              pair.current.readAt === data.readAt
                ? pair.previous
                : null
            }
            readAt={data.readAt}
          />
          <div className="dc-overview-grid">
            <Card className="dc-evidence-panel">
              <div className="dc-panel-heading">
                <div>
                  <h2>Product evidence</h2>
                  <p className="dc-meta">
                    Readiness of observed products, not citywide coverage.
                  </p>
                </div>
                <Link href="/dashboard/sources" className="dc-link">
                  Sources
                </Link>
              </div>
              <ProductUnits
                products={data.products.map((p) => ({
                  ...p,
                  label: productLabel(p.id),
                }))}
                included={
                  data.metrics.find((m) => m.id === "M4")?.denominator
                    .included ?? null
                }
                observed={
                  data.metrics.find((m) => m.id === "M4")?.denominator
                    .observed ?? null
                }
              />
              <div className="dc-product-table-region">
                <table className="dc-product-table">
                  <caption className="sr-only">
                    Stored record freshness per product. Units differ between
                    products and are not summed.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Product</th>
                      <th scope="col">Evidence</th>
                      <th scope="col">Record freshness</th>
                      <th scope="col" className="numeric dc-count-column">
                        Recent
                      </th>
                      <th scope="col" className="numeric dc-count-column">
                        Stale
                      </th>
                      <th scope="col" className="numeric dc-count-column">
                        Unavailable
                      </th>
                    </tr>
                  </thead>
                  {(["periodic", "demand"] as const).map((mode) => {
                    const rows = data.products.filter((p) => p.mode === mode);
                    return rows.length ? (
                      <tbody key={mode}>
                        <tr className="dc-group-row">
                          <th scope="colgroup" colSpan={6}>
                            {mode === "periodic"
                              ? "Periodic evidence"
                              : "On-demand evidence"}
                          </th>
                        </tr>
                        {rows.map((p) => (
                          <tr key={p.id}>
                            <th scope="row">
                              <Link
                                href={`/dashboard/sources/${encodeURIComponent(p.source)}`}
                              >
                                {productLabel(p.id)}
                              </Link>
                            </th>
                            <td>
                              <span
                                className="dc-status"
                                data-tone={
                                  !p.enabled
                                    ? "muted"
                                    : p.usable
                                      ? "neutral"
                                      : "warning"
                                }
                              >
                                {!p.enabled
                                  ? "Disabled"
                                  : p.usable
                                    ? "Usable"
                                    : "No usable evidence"}
                              </span>
                            </td>
                            <td>
                              <FreshnessBar
                                unit={productUnit(p.unit)}
                                counts={p}
                              />
                            </td>
                            {(["recent", "stale", "unavailable"] as const).map(
                              (key) => (
                                <td
                                  key={key}
                                  className="numeric dc-count-column"
                                  data-zero={p[key] === 0}
                                >
                                  {p[key] === null ? (
                                    <>
                                      <span aria-hidden="true">—</span>
                                      <span className="sr-only">Unknown</span>
                                    </>
                                  ) : (
                                    p[key]?.toLocaleString("en-GB")
                                  )}
                                </td>
                              ),
                            )}
                          </tr>
                        ))}
                      </tbody>
                    ) : null;
                  })}
                </table>
              </div>
              <Link
                href="/dashboard/mobility?section=reference&category=places"
                className="dc-link dc-panel-footer"
              >
                Browse reference catalogs
              </Link>
            </Card>
            <div className="dc-stack">
              <Card>
                <div className="dc-panel-heading">
                  <h2>Needs attention</h2>
                  {data.attention.length ? (
                    <span className="dc-count-badge">
                      {data.attention.length}
                    </span>
                  ) : null}
                </div>
                {data.attention.length ? (
                  <ul className="dc-row-list">
                    {data.attention.slice(0, 3).map((a) => {
                      const product = data.products.find((p) =>
                        a.label.startsWith(p.label),
                      );
                      return (
                        <li key={a.href + a.label}>
                          <Link href={a.href} className="dc-row-link">
                            <span
                              className="dc-status"
                              data-tone="warning"
                              aria-hidden="true"
                            />
                            <span className="dc-row-text">
                              <strong>{productLabel(product?.id ?? "")}</strong>
                              <span className="dc-meta">
                                {product?.total === null
                                  ? "No stored evidence"
                                  : "Check retained evidence"}
                              </span>
                            </span>
                            <span className="dc-row-action">Inspect</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="dc-meta">No attention items returned.</p>
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
                <ActivityPreview data={data.activity} />
                {data.recentEvents.length ? (
                  <ul className="dc-row-list">
                    {data.recentEvents.slice(0, 3).map((e) => (
                      <li key={e.id}>
                        <Link
                          href={`/dashboard/activity/${e.id}`}
                          className="dc-row-link"
                        >
                          <span
                            className="dc-status"
                            data-tone={outcomeTones[e.outcome] ?? "neutral"}
                            aria-hidden="true"
                          />
                          <span className="dc-row-text">
                            <strong>
                              {eventTypes[e.type]} ·{" "}
                              {sourceNames[e.source] ?? e.source}
                            </strong>
                            <span className="dc-meta">
                              {eventOutcomes[e.outcome]} ·{" "}
                              <Instant value={e.occurredAt} />
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dc-meta">No events captured in this period.</p>
                )}
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
