"use client";
import type {
  DashboardActivityChart,
  DashboardMetric,
} from "@mobility/contracts";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AnimatedValue } from "./animated-value";
import { Card, Segmented, Sheet, Table } from "./primitives";
import { Instant } from "./shared";
export const number = (n: unknown) =>
  typeof n === "number"
    ? new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(n)
    : "Unknown";
export function MetricStrip({ metrics }: { metrics: DashboardMetric[] }) {
  return (
    <section aria-label="Mobility indicators" className="dc-metric-grid">
      {metrics.map((m) => (
        <MetricCard key={`${m.id}:${m.selection}`} metric={m} />
      ))}
    </section>
  );
}
function MetricCard({ metric: m }: { metric: DashboardMetric }) {
  const [open, setOpen] = useState(false);
  const labels: Record<string, string> = {
    M1: "Available bikes",
    M2: "Published parking spaces",
    M3: "Active published notices",
    M4: "Product readiness",
  };
  return (
    <Card className="dc-metric">
      <h2>{labels[m.id] ?? m.label}</h2>
      <p className="dc-value">
        <AnimatedValue value={m.value} format={number} />
        <span className="sr-only">{m.value === null ? "Unknown" : ""}</span>
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
            ? `${number(m.denominator.included)} / ${number(m.denominator.observed)} enabled products`
            : "Non-exhaustive published coverage"}
      </p>
      <div className="dc-metric-actions">
        <Link href={m.detailHref} className="dc-link">
          View data
        </Link>
        <Sheet
          open={open}
          onOpenChange={setOpen}
          title={`${labels[m.id] ?? m.label} definition`}
          trigger={
            <Button size="sm" variant="ghost">
              Definition
            </Button>
          }
        >
          <dl className="dc-stack">
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
      </div>
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
      className="rounded-lg border bg-card p-4"
      aria-label="Product age coverage"
    >
      <h2 className="text-sm font-medium">Selection evidence coverage</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {number(total)} {unit} in the complete selection, not only this page.
      </p>
      {total > 0 ? (
        <div
          className="my-3 flex h-3 overflow-hidden rounded-full"
          aria-hidden="true"
        >
          {states.map(([label, n, color]) => (
            <span
              key={label}
              className={color}
              style={{ width: `${(n / total) * 100}%` }}
            />
          ))}
        </div>
      ) : null}
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
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
  const [series, setSeries] = useState("both");
  const [selected, setSelected] = useState<string | null>(null);
  const max = Math.max(
    1,
    ...data.bins.flatMap((b) => [
      series !== "errors" ? (b.publications ?? 0) : 0,
      series !== "publications" ? (b.errors ?? 0) : 0,
    ]),
  );
  const bin = data.bins.find((b) => b.from === selected);
  const tick = (t: string) =>
    new Date(t).toLocaleString("en-GB", {
      timeZone: "Europe/Madrid",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <Card>
      <div className="dc-panel-heading">
        <h2>Recorded activity</h2>
        <Segmented
          label="Chart series"
          value={series}
          onChange={setSeries}
          options={[
            ["publications", "Publications"],
            ["errors", "Errors"],
            ["both", "Both"],
          ]}
        />
      </div>
      <p className="dc-meta">
        Publications {number(data.publications)} · Errors {number(data.errors)}{" "}
        · Counts, not traffic or freshness
      </p>
      {data.firstRetainedEventAt ? (
        <>
          <svg
            viewBox="0 0 700 240"
            role="img"
            aria-label="Recorded count bars. Use the interval buttons or exact-data table for values."
            className="dc-chart"
          >
            <title>Recorded publication and error counts</title>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line
                  x1="40"
                  x2="685"
                  y1={195 - f * 160}
                  y2={195 - f * 160}
                  className="dc-grid-line"
                />
                <text x="32" y={199 - f * 160} textAnchor="end">
                  {number(Math.round(max * f))}
                </text>
              </g>
            ))}
            {data.bins.map((b, i) => {
              const width = 640 / data.bins.length,
                x = 42 + i * width;
              return (
                <g key={b.from}>
                  {b.publications === null && b.errors === null ? (
                    <rect
                      x={x}
                      y="35"
                      width={width - 2}
                      height="160"
                      fill="var(--dash-well)"
                      stroke="var(--dash-control-line)"
                      strokeDasharray="3 3"
                    />
                  ) : null}
                  {series !== "errors" && b.publications !== null ? (
                    <rect
                      x={x}
                      y={195 - (b.publications / max) * 160}
                      width={width * 0.38}
                      height={(b.publications / max) * 160}
                      fill="var(--dash-series)"
                    />
                  ) : null}
                  {series !== "publications" && b.errors !== null ? (
                    <rect
                      x={x + width * 0.4}
                      y={195 - (b.errors / max) * 160}
                      width={width * 0.38}
                      height={(b.errors / max) * 160}
                      fill="var(--dash-danger)"
                    />
                  ) : null}
                </g>
              );
            })}
            <text x="40" y="224">
              {tick(data.from)}
            </text>
            <text x="685" y="224" textAnchor="end">
              {tick(data.to)}
            </text>
          </svg>
          <fieldset
            className="dc-chart-controls"
            aria-label="Inspect count intervals"
          >
            <label htmlFor="activity-bin">Inspect interval</label>
            <input
              id="activity-bin"
              type="range"
              min={0}
              max={Math.max(0, data.bins.length - 1)}
              value={Math.max(
                0,
                data.bins.findIndex((b) => b.from === selected),
              )}
              onChange={(e) =>
                setSelected(data.bins[Number(e.target.value)]?.from ?? null)
              }
              aria-valuetext={
                bin
                  ? `${tick(bin.from)}: publications ${number(bin.publications)}, errors ${number(bin.errors)}`
                  : "Select a retained interval"
              }
            />
          </fieldset>
          {bin ? (
            <p role="status" className="dc-meta">
              <Instant value={bin.from} /> — <Instant value={bin.to} /> ·
              Publications {number(bin.publications)} · Errors{" "}
              {number(bin.errors)}
            </p>
          ) : null}
        </>
      ) : (
        <p className="py-6">
          No retained evidence to plot. This does not mean zero activity.
        </p>
      )}
      <p className="dc-meta mt-3">
        Europe/Madrid · Best-effort capture. Dashed gaps before retained
        evidence are unknown, not zero.
      </p>
      <details className="mt-4">
        <summary className="dc-link cursor-pointer">
          Exact interval data
        </summary>
        <Table>
          <thead>
            <tr>
              <th>Interval (Europe/Madrid)</th>
              <th>Publications</th>
              <th>Errors</th>
            </tr>
          </thead>
          <tbody>
            {data.bins.map((b) => (
              <tr key={b.from}>
                <td>
                  <Instant value={b.from} /> — <Instant value={b.to} />
                </td>
                <td>{number(b.publications)}</td>
                <td>{number(b.errors)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </details>
    </Card>
  );
}
