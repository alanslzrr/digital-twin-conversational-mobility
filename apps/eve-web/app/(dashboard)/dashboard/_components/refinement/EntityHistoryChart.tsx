"use client";

import type { DashboardEntitySeries } from "@mobility/contracts";
import { useId, useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUi } from "@/i18n/provider";
import { prepareHistory } from "./core";

const config = {
  value: { label: "Recorded value", color: "var(--dash-series)" },
} satisfies ChartConfig;
const compactTime = (n: number, numberLocale = "en-GB") =>
  new Intl.DateTimeFormat(numberLocale, {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  }).format(n);
const fullTime = (n: number, numberLocale = "en-GB") =>
  new Intl.DateTimeFormat(numberLocale, {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(n);

/** Receives the existing bounded response. Selection/fetching stays in entity-history.tsx. */
export function EntityHistoryChart({
  data,
  label,
  interpolation = "linear",
}: {
  data: DashboardEntitySeries;
  label: string;
  interpolation?: "linear" | "stepAfter";
}) {
  const { t, numberLocale } = useUi();

  const headingId = useId();
  const prepared = useMemo(
    () => prepareHistory(data.points, data.gapSeconds),
    [data.points, data.gapSeconds],
  );
  const tableOnly = prepared.status === "table-only";
  return (
    <section className="rf-history" aria-labelledby={headingId}>
      <div className="rf-panel-heading">
        <h3 id={headingId}>{label}</h3>
        <span className="rf-meta">{data.unit}</span>
      </div>
      <p className="rf-meta">
        {t(
          "EntityHistoryChart.recordedObservationsEuropeMadridPartialCoverage",
        )}
        {data.reduced ? t("EntityHistoryChart.reducedSeries") : ""}
      </p>
      <Tabs defaultValue="chart" className="rf-tabs">
        <TabsList aria-label={`${label} representation`}>
          <TabsTrigger value="chart">{t("ActivityLanes.chart")}</TabsTrigger>
          <TabsTrigger value="data">{t("ActivityLanes.exactData")}</TabsTrigger>
        </TabsList>
        <TabsContent value="chart">
          {tableOnly ? (
            <p className="rf-meta">
              {prepared.reason} {t("EntityHistoryChart.useExactData")}
            </p>
          ) : data.points.length === 0 ? (
            <p className="rf-meta">
              {t("EntityHistoryChart.noRetainedObservationsForThisSelection")}
            </p>
          ) : (
            <ChartContainer
              role="region"
              config={config}
              className="rf-history-chart"
              aria-label={`${label}, ${data.unit}. Gaps are not zero.`}
            >
              <LineChart
                accessibilityLayer
                data={prepared.points}
                margin={{ top: 12, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="var(--dash-line-soft)"
                />
                <XAxis
                  dataKey="at"
                  type="number"
                  scale="time"
                  domain={
                    data.points.length > 1
                      ? ["dataMin", "dataMax"]
                      : ["dataMin - 30000", "dataMax + 30000"]
                  }
                  tickFormatter={(n) => compactTime(n, numberLocale)}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={36}
                  stroke="var(--dash-muted)"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  stroke="var(--dash-muted)"
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      className="dashboard-dialog rf-tooltip"
                      labelFormatter={(v) => fullTime(Number(v), numberLocale)}
                    />
                  }
                />
                <Line
                  dataKey="value"
                  type={interpolation}
                  connectNulls={false}
                  stroke="var(--color-value)"
                  strokeWidth={2}
                  dot={data.points.length <= 12 ? { r: 3 } : false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          )}
          {!tableOnly && prepared.gaps > 0 && (
            <p className="rf-meta">
              {prepared.gaps} {t("EntityHistoryChart.captureGap")}
              {prepared.gaps === 1 ? "" : "s"}
              {t("EntityHistoryChart.connectingLinesStopAtGaps")}
            </p>
          )}
        </TabsContent>
        <TabsContent value="data">
          <section
            className="rf-table-region"
            aria-label={`${label} exact observations`}
          >
            <Table
              aria-label={t("EntityHistoryChart.entityObservationHistory")}
            >
              <caption className="sr-only">
                {t(
                  "EntityHistoryChart.everySuppliedObservationIncludingRevisions",
                )}
                {data.unit}.
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("EntityHistoryChart.observedIso")}</TableHead>
                  <TableHead>
                    {t("EntityHistoryChart.value")}
                    {data.unit})
                  </TableHead>
                  <TableHead>{t("EntityHistoryChart.ingestedIso")}</TableHead>
                  <TableHead>{t("EntityHistoryChart.revision")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.points.map((p, index) => (
                  <TableRow // biome-ignore lint/suspicious/noArrayIndexKey: preserve duplicate exact observations without inventing a revision winner.
                    key={`${p.revisionId}:${p.observedAt}:${index}`}
                  >
                    <TableCell>
                      <time dateTime={p.observedAt}>{p.observedAt}</time>
                    </TableCell>
                    <TableCell className="rf-number">
                      {String(p.value)}
                    </TableCell>
                    <TableCell>
                      <time dateTime={p.ingestedAt}>{p.ingestedAt}</time>
                    </TableCell>
                    <TableCell className="rf-code">{p.revisionId}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </TabsContent>
      </Tabs>
    </section>
  );
}
