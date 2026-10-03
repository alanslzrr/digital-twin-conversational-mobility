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
  return (
    <Card className="dc-metric">
      <div className="dc-metric-heading">
        <h2>
          <Link href={m.detailHref}>{labels[m.id] ?? m.label}</Link>
        </h2>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`${labels[m.id] ?? m.label} definition`}
          onClick={() => setOpen(true)}
        >
          <Info />
        </Button>
      </div>
      <p className="dc-value">
        <AnimatedValue value={m.value} format={number} />
        <span className="sr-only">{m.value === null ? "Unavailable" : ""}</span>
        {m.id === "M4" && m.value === m.denominator.included ? (
          <span className="text-2xl"> / {number(m.denominator.observed)}</span>
        ) : null}
        <span className="ml-2 text-sm font-normal tracking-normal">
          {{ M1: "bikes", M2: "spaces", M3: "notices", M4: "dynamic products" }[
            m.id
          ] ?? m.unit}
        </span>
      </p>
      <p className="dc-meta">
        {m.id === "M1" || m.id === "M2"
          ? `${number(m.denominator.included)} / ${number(m.denominator.observed)} stored ${m.id === "M1" ? "stations" : "parking facilities"}`
          : m.id === "M4"
            ? "Enabled products with usable evidence"
            : "Non-exhaustive published coverage"}
      </p>
      <p className="dc-meta">
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
    ["Recent readings", recent, "bg-primary"],
    ["Stale evidence", stale, "bg-muted-foreground"],
    ["No usable evidence", unavailable, "bg-destructive"],
    ["Reference", reference, "bg-accent-foreground"],
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
          {states.map(([label, n, color]) => (
            <span
              key={label}
              className={color}
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
export function ActivityChart({ data }: { data: DashboardActivityChart }) {
  return (
    <Card>
      <ActivityLanes data={data} />
    </Card>
  );
}
