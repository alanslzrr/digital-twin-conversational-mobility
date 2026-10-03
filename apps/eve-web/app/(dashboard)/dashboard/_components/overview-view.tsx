"use client";
import type { DashboardOverview } from "@mobility/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useDashboard, useDashboardContext } from "@/src/dashboard-client";
import { eventOutcomes, eventTypes } from "./event-copy";
import { MetricStrip } from "./insights";
import { Card, Segmented } from "./primitives";
import { productLabel, productUnit } from "./product-copy";
import { FreshnessGraphic } from "./refinement/FreshnessGraphic";
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
          <div className="dc-toolbar">
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
            <Card>
              <div className="dc-panel-heading">
                <h2>Product evidence</h2>
                <Link href="/dashboard/sources" className="dc-link">
                  Sources
                </Link>
              </div>
              <p className="dc-meta">
                Readiness of observed products, not citywide coverage.
              </p>
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
                          href={`/dashboard/sources/${encodeURIComponent(p.source)}`}
                          className="hover:underline"
                        >
                          {productLabel(p.id)}
                        </Link>
                        <span className="dc-meta">
                          {!p.enabled
                            ? "Disabled"
                            : p.usable
                              ? "Usable evidence"
                              : "No usable evidence"}
                        </span>
                        <FreshnessGraphic
                          label="Record freshness"
                          unit={productUnit(p.unit)}
                          counts={p}
                        />
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
                        <p>
                          {productLabel(
                            data.products.find((p) =>
                              a.label.startsWith(p.label),
                            )?.id ?? "",
                          )}{" "}
                          ·{" "}
                          {data.products.find((p) =>
                            a.label.startsWith(p.label),
                          )?.total === null
                            ? "No stored evidence"
                            : "Check retained evidence"}
                        </p>
                        <Link href={a.href} className="dc-link">
                          Inspect evidence
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dc-meta mt-3">No attention items returned.</p>
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
                    {data.recentEvents.slice(0, 3).map((e) => (
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
