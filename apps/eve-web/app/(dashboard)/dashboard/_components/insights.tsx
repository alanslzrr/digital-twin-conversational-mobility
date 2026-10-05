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
import { messages } from "@/i18n/messages";
import { useUi } from "@/i18n/provider";
import { AnimatedValue } from "./animated-value";
import { Card, Sheet } from "./primitives";
import { ActivityLanes } from "./refinement/ActivityLanes";
import { compareSnapshotReadings } from "./refinement/core";
import { Instant } from "./shared";
export const number = (n: unknown, numberLocale = "en-GB") =>
  typeof n === "number"
    ? new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 2 }).format(
        n,
      )
    : messages[numberLocale === "es-ES" ? "es" : "en"].conversationView.unknown;
export function MetricStrip({
  metrics,
  previous,
  readAt,
}: {
  metrics: DashboardMetric[];
  previous?: DashboardOverview | null;
  readAt?: string;
}) {
  const { t } = useUi();

  return (
    <section
      aria-label={t("insights.mobilityIndicators")}
      className="dc-metric-grid"
    >
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
  const { t, copy, numberLocale } = useUi();

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
    M1: t("insights.availableBikes"),
    M2: t("insights.publishedParkingSpaces"),
    M3: t("insights.activePublishedNotices"),
    M4: t("insights.productReadiness"),
  };
  const { included, observed } = m.denominator;
  // Only Core-owned metric explanation templates are localized. Category labels
  // inside them remain original provider values; DTOs and evidence are untouched.
  const category =
    /^Suma de una única categoría publicada \((.*)\) por aparcamiento, observada en los últimos cinco minutos\.$/.exec(
      m.definition,
    )?.[1];
  const definition =
    m.id === "M2" && category !== undefined
      ? t("presentation.parkingDefinition", { category })
      : copy(m.definition);
  const selection =
    m.id === "M2" && m.selection.startsWith("Categoría publicada: ")
      ? t("presentation.publishedCategory", {
          category: m.selection.slice("Categoría publicada: ".length),
        })
      : copy(m.selection);
  const coverage =
    m.id === "M1" && included !== null && observed !== null
      ? t("presentation.bikeCoverage", { included, observed })
      : m.id === "M2" &&
          included !== null &&
          observed !== null &&
          category !== undefined
        ? t("presentation.parkingCoverage", { included, observed, category })
        : copy(m.coverage);
  const unit =
    m.id === "M4" && observed !== null
      ? t("presentation.enabledOf", { count: observed })
      : copy(m.unit);

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
      ? t("presentation.storedScope", {
          included: number(included, numberLocale),
          observed: number(observed, numberLocale),
          unit:
            m.id === "M1"
              ? t("presentation.stations")
              : t("insights.parkingFacilities"),
        })
      : m.id === "M4"
        ? t("insights.enabledProductsWithUsableEvidence")
        : t("insights.nonExhaustivePublishedCoverage");
  return (
    <Card className="dc-metric">
      <div className="dc-metric-heading">
        <h2>
          <Link href={m.detailHref}>{copy(labels[m.id]) ?? m.label}</Link>
        </h2>
        <Button
          size="icon"
          variant="ghost"
          className="dc-metric-info"
          aria-label={t("presentation.definition", {
            label: copy(labels[m.id]) ?? m.label,
          })}
          onClick={() => setOpen(true)}
        >
          <Info />
        </Button>
      </div>
      <p className="dc-value">
        <AnimatedValue
          value={m.value}
          format={(value) => number(value, numberLocale)}
        />
        <span className="sr-only">
          {m.value === null ? t("activityView.unavailable") : ""}
        </span>
        {m.id === "M4" && m.value === included ? (
          <span className="dc-value-denominator">
            /{number(observed, numberLocale)}
          </span>
        ) : null}
        <span className="dc-value-unit">
          {{
            M1: t("presentation.bikes"),
            M2: t("presentation.spaces"),
            M3: t("presentation.notices"),
            M4: t("presentation.products"),
          }[m.id] ?? copy(m.unit)}
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
          t("insights.coverageChanged")
        ) : comparison.status === "reading-change" ? (
          comparison.delta === 0 ? (
            t("insights.readingUnchanged")
          ) : (
            <>
              {t("insights.reading")}
              {comparison.delta > 0 ? "+" : ""}
              {number(comparison.delta, numberLocale)} {unit}{" "}
              {t("commonFragments.since")}{" "}
              <Instant value={comparison.baselineAt} compact />
            </>
          )
        ) : (
          t("insights.comparisonUnavailable")
        )}
      </p>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t("presentation.definition", {
          label: copy(labels[m.id]) ?? m.label,
        })}
      >
        <dl className="dc-stack">
          <div>
            <dt>{t("insights.comparison")}</dt>
            <dd>
              {comparison.status !== "reading-change"
                ? copy(comparison.reason)
                : t(
                    "insights.changeBetweenScreenReadingsNotATrendEqualCounts",
                  )}{" "}
              {t("insights.globalHistoricalBaselinesAreNotExposed")}
            </dd>
          </div>
          <div>
            <dt>{t("insights.definition")}</dt>
            <dd>{definition}</dd>
          </div>
          <div>
            <dt>{t("conversationView.coverage")}</dt>
            <dd>
              {coverage}
              {m.missingReason ? ` · ${copy(m.missingReason)}` : ""}
            </dd>
          </div>
          <div>
            <dt>{t("insights.selection")}</dt>
            <dd>{selection}</dd>
          </div>
          <div>
            <dt>{t("insights.evidencePeriod")}</dt>
            <dd>
              {m.period.from ? (
                <>
                  <Instant value={m.period.from} /> —{" "}
                </>
              ) : (
                t("insights.currentValidityEvaluatedAt")
              )}
              <Instant value={m.period.to} />
            </dd>
          </div>
          <div>
            <dt>{t("insights.provenance")}</dt>
            <dd>{copy(m.provenance)}</dd>
          </div>
          <div>
            <dt>{t("insights.excluded")}</dt>
            <dd>{copy(m.excludes)}</dd>
          </div>
          <div>
            <dt>{t("insights.evaluated")}</dt>
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
  const { t, numberLocale } = useUi();

  const states = [
    [t("insights.recentReadings"), recent, "recent"],
    [t("insights.staleEvidence"), stale, "stale"],
    [t("insights.noUsableEvidence"), unavailable, "unavailable"],
    [t("insights.reference"), reference, "static"],
  ] as const;
  return (
    <section
      className="dc-selection-coverage"
      aria-label={t("insights.productAgeCoverage")}
    >
      <h2 className="text-sm font-medium">
        {t("insights.selectionEvidenceCoverage")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {number(total, numberLocale)}{" "}
        {(
          { "registros del producto": t("insights.productRecords") } as Record<
            string,
            string
          >
        )[unit] ?? unit}{" "}
        {t("insights.inTheCompleteSelectionNotOnlyThisPage")}
      </p>
      {total > 0 ? (
        <div className="dc-selection-track" aria-hidden="true">
          {states
            .filter(([, n]) => n > 0)
            .map(([, n, state]) => (
              <span
                key={state}
                data-state={state}
                style={{ width: `${(n / total) * 100}%` }}
              />
            ))}
        </div>
      ) : null}
      <ul className="dc-selection-counts">
        {states.map(([label, n, state]) => (
          <li key={state}>
            {label}:{" "}
            <span className="font-medium tabular-nums">
              {number(n, numberLocale)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
/** Summary of the overview's existing bins; the interactive explorer lives on Activity. */
export function ActivityPreview({ data }: { data: DashboardActivityChart }) {
  const { t, numberLocale } = useUi();

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
          <strong>{number(data.publications, numberLocale)}</strong>{" "}
          {t("commonFragments.publications")}{" "}
        </p>
        <p data-tone={data.errors ? "danger" : undefined}>
          <strong>{number(data.errors, numberLocale)}</strong>{" "}
          {t("commonFragments.errors")}{" "}
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
          ? `${unknownBins ? t("presentation.missingIntervals", { count: unknownBins, total: data.bins.length }) : ""}${t("presentation.activityLegend")}`
          : t("insights.noIntervalsReturned")}
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
