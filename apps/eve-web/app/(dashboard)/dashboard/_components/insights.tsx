"use client";
import type {
  DashboardActivityChart,
  DashboardMetric,
  DashboardOverview,
} from "@mobility/contracts";
import { Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AnimatedValue } from "./animated-value";
import { Card, Sheet } from "./primitives";
import { ActivityLanes } from "./refinement/ActivityLanes";
import { compareSnapshotReadings } from "./refinement/core";
import { Instant } from "./shared";
export const number = (n: unknown) =>
  typeof n === "number"
    ? new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(n)
    : "Unknown";
export function MetricStrip({
  metrics,
  previous,
  readAt,
}: {
  metrics: DashboardMetric[];
  previous?: DashboardOverview | null;
  readAt?: string;
}) {
  return (
    <section aria-label="Mobility indicators" className="dc-metric-grid">
      {metrics.map((m) => (
        <MetricCard
          key={`${m.id}:${m.selection}`}
          metric={m}
          previous={previous ?? null}
          readAt={readAt ?? ""}
        />
      ))}
    </section>
  );
}
function MetricCard({
  metric: m,
  previous,
  readAt,
}: {
  metric: DashboardMetric;
  previous: DashboardOverview | null;
  readAt: string;
}) {
  const before = previous?.metrics.find((p) => p.id === m.id);
  const snapshot = (metric: DashboardMetric, at: string) => ({
    metricId: metric.id,
    selectionKey: JSON.stringify([
      metric.selection,
      metric.definition,
      metric.provenance,
      metric.excludes,
      metric.period.from === null
        ? null
        : Date.parse(metric.period.to) - Date.parse(metric.period.from),
    ]),
    unit: metric.unit,
    value: metric.value,
    readAt: at,
    included: metric.denominator.included,
    observed: metric.denominator.observed,
  });
  const comparison = compareSnapshotReadings(
    snapshot(m, readAt),
    before && previous ? snapshot(before, previous.readAt) : null,
  );
  const [open, setOpen] = useState(false);
  const labels: Record<string, string> = {
    M1: "Available bikes",
    M2: "Published parking spaces",
    M3: "Active published notices",
    M4: "Product readiness",
  };
  const { included, observed } = m.denominator;
  const ratio =
    m.id !== "M3" &&
    included !== null &&
    observed !== null &&
    observed > 0 &&
    included <= observed
      ? included / observed
      : null;
  const scope =
    m.id === "M1" || m.id === "M2"
      ? `${number(included)} of ${number(observed)} stored ${m.id === "M1" ? "stations" : "parking facilities"} included`
      : m.id === "M4"
        ? "Enabled products with usable evidence"
        : "Non-exhaustive published coverage";
  return (
    <Card className="dc-metric">
      <div className="dc-metric-heading">
        <h2>
          <Link href={m.detailHref}>{labels[m.id] ?? m.label}</Link>
        </h2>
        <Button
          size="icon"
          variant="ghost"
          className="dc-metric-info"
          aria-label={`${labels[m.id] ?? m.label} definition`}
          onClick={() => setOpen(true)}
        >
          <Info />
        </Button>
      </div>
      <p className="dc-value">
        <AnimatedValue value={m.value} format={number} />
        <span className="sr-only">{m.value === null ? "Unavailable" : ""}</span>
        {m.id === "M4" && m.value === included ? (
          <span className="dc-value-denominator">/{number(observed)}</span>
        ) : null}
        <span className="dc-value-unit">
          {{ M1: "bikes", M2: "spaces", M3: "notices", M4: "products" }[m.id] ??
            m.unit}
        </span>
      </p>
      <div className="dc-metric-scope">
        {ratio !== null ? (
          <span className="dc-meter" aria-hidden="true">
            <span style={{ width: `${ratio * 100}%` }} />
          </span>
        ) : null}
        <p>{scope}</p>
      </div>
      <p className="dc-metric-foot" data-state={comparison.status}>
        {comparison.status === "coverage-changed" ? (
          "Coverage changed"
        ) : comparison.status === "reading-change" ? (
          comparison.delta === 0 ? (
            "Reading unchanged"
          ) : (
            <>
              Reading {comparison.delta > 0 ? "+" : ""}
              {number(comparison.delta)} {m.unit} since{" "}
              <Instant value={comparison.baselineAt} compact />
            </>
          )
        ) : (
          "Comparison unavailable"
        )}
      </p>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={`${labels[m.id] ?? m.label} definition`}
      >
        <dl className="dc-stack">
          <div>
            <dt>Comparison</dt>
            <dd>
              {comparison.status !== "reading-change"
                ? comparison.reason
                : "Change between screen readings, not a trend. Equal counts do not prove equal contributors."}{" "}
              Global historical baselines are not exposed.
            </dd>
          </div>
          <div>
            <dt>Definition</dt>
            <dd>{m.definition}</dd>
          </div>
          <div>
            <dt>Coverage</dt>
            <dd>
              {m.coverage}
              {m.missingReason ? ` · ${m.missingReason}` : ""}
            </dd>
          </div>
          <div>
            <dt>Selection</dt>
            <dd>{m.selection}</dd>
          </div>
          <div>
            <dt>Evidence period</dt>
            <dd>
              {m.period.from ? (
                <>
                  <Instant value={m.period.from} /> —{" "}
                </>
              ) : (
                "Current validity evaluated at "
              )}
              <Instant value={m.period.to} />
            </dd>
          </div>
          <div>
            <dt>Provenance</dt>
            <dd>{m.provenance}</dd>
          </div>
          <div>
            <dt>Excluded</dt>
            <dd>{m.excludes}</dd>
          </div>
          <div>
            <dt>Evaluated</dt>
            <dd>
              <Instant value={m.evaluatedAt} />
            </dd>
          </div>
        </dl>
      </Sheet>
    </Card>
  );
}
export function FreshnessBreakdown({
  total,
  recent,
  stale,
  unavailable,
  static: reference,
  unit,
}: {
  total: number;
  recent: number;
  stale: number;
  unavailable: number;
  static: number;
  unit: string;
}) {
  const states = [
    ["Recent readings", recent, "recent"],
    ["Stale evidence", stale, "stale"],
    ["No usable evidence", unavailable, "unavailable"],
    ["Reference", reference, "static"],
  ] as const;
  return (
    <section
      className="dc-selection-coverage"
      aria-label="Product age coverage"
    >
      <h2 className="text-sm font-medium">Selection evidence coverage</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {number(total)}{" "}
        {(
          { "registros del producto": "product records" } as Record<
            string,
            string
          >
        )[unit] ?? unit}{" "}
        in the complete selection, not only this page.
      </p>
      {total > 0 ? (
        <div className="dc-selection-track" aria-hidden="true">
          {states
            .filter(([, n]) => n > 0)
            .map(([label, n, state]) => (
              <span
                key={label}
                data-state={state}
                style={{ width: `${(n / total) * 100}%` }}
              />
            ))}
        </div>
      ) : null}
      <ul className="dc-selection-counts">
        {states.map(([label, n]) => (
          <li key={label}>
            {label}:{" "}
            <span className="font-medium tabular-nums">{number(n)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
/** Summary of the overview's existing bins; the interactive explorer lives on Activity. */
export function ActivityPreview({ data }: { data: DashboardActivityChart }) {
  const known = (key: "publications" | "errors") =>
    data.bins.flatMap((b) => (b[key] === null ? [] : [b[key] as number]));
  const maxPublications = Math.max(1, ...known("publications"));
  const unknownBins = data.bins.filter(
    (b) => b.publications === null && b.errors === null,
  ).length;
  return (
    <figure className="dc-activity-preview">
      <div className="dc-activity-totals">
        <p>
          <strong>{number(data.publications)}</strong> publications
        </p>
        <p data-tone={data.errors ? "danger" : undefined}>
          <strong>{number(data.errors)}</strong> errors
        </p>
      </div>
      {data.bins.length ? (
        <div
          className="dc-activity-bars"
          style={{
            gridTemplateColumns: `repeat(${data.bins.length}, minmax(0, 1fr))`,
          }}
          aria-hidden="true"
        >
          {data.bins.map((b) => (
            <span
              key={b.from}
              className="dc-activity-bin"
              data-unknown={b.publications === null}
            >
              {b.publications !== null && b.publications > 0 ? (
                <span
                  className="dc-activity-bar"
                  style={{
                    height: `${Math.max(6, (b.publications / maxPublications) * 100)}%`,
                  }}
                />
              ) : null}
              <span
                className="dc-activity-error"
                data-error={b.errors !== null && b.errors > 0}
              />
            </span>
          ))}
        </div>
      ) : null}
      <figcaption className="dc-meta">
        {data.bins.length
          ? `${unknownBins ? `${unknownBins} of ${data.bins.length} intervals not captured · ` : ""}Bars: publications per interval · red ticks: intervals with errors`
          : "No intervals returned."}
      </figcaption>
    </figure>
  );
}
export function ActivityChart({ data }: { data: DashboardActivityChart }) {
  return (
    <Card>
      <ActivityLanes data={data} />
    </Card>
  );
}
