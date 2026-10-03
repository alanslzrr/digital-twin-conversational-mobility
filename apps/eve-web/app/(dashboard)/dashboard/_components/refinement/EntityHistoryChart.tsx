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
import { prepareHistory } from "./core";

const config = {
  value: { label: "Recorded value", color: "var(--dash-series)" },
} satisfies ChartConfig;
const compactTime = (n: number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  }).format(n);
const fullTime = (n: number) =>
  new Intl.DateTimeFormat("en-GB", {
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
        Recorded observations · Europe/Madrid · partial coverage
        {data.reduced ? " · reduced series" : ""}
      </p>
      <Tabs defaultValue="chart" className="rf-tabs">
        <TabsList aria-label={`${label} representation`}>
          <TabsTrigger value="chart">Chart</TabsTrigger>
          <TabsTrigger value="data">Exact data</TabsTrigger>
        </TabsList>
        <TabsContent value="chart">
          {tableOnly ? (
            <p className="rf-meta">{prepared.reason} Use Exact data.</p>
          ) : data.points.length === 0 ? (
            <p className="rf-meta">
              No retained observations for this selection.
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
                  tickFormatter={compactTime}
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
                      labelFormatter={(v) => fullTime(Number(v))}
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
              {prepared.gaps} capture gap{prepared.gaps === 1 ? "" : "s"}
              {"; connecting lines stop at gaps."}
            </p>
          )}
        </TabsContent>
        <TabsContent value="data">
          <section
            className="rf-table-region"
            aria-label={`${label} exact observations`}
          >
            <Table>
              <caption className="sr-only">
                Every supplied observation, including revisions. {data.unit}.
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Observed (ISO)</TableHead>
                  <TableHead>Value ({data.unit})</TableHead>
                  <TableHead>Ingested (ISO)</TableHead>
                  <TableHead>Revision</TableHead>
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
