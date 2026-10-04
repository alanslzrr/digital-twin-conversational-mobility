"use client";

import type { DashboardActivityChart } from "@mobility/contracts";
import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { messages } from "@/i18n/messages";
import { useUi } from "@/i18n/provider";

const format = (v: number | null, numberLocale = "en-GB") =>
  v === null
    ? messages[numberLocale === "es-ES" ? "es" : "en"].activityView.unavailable
    : new Intl.NumberFormat(numberLocale).format(v);
const time = (v: string, numberLocale = "en-GB") =>
  new Intl.DateTimeFormat(numberLocale, {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(v));

/** Local plot rendering; shadcn provides tabs/table. No extra data requests. */
export function ActivityLanes({ data }: { data: DashboardActivityChart }) {
  const { t, numberLocale } = useUi();

  const id = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const focusedLane = useRef<string | null>(null);
  useEffect(() => {
    if (!selected || data.bins.some((b) => b.from === selected)) return;
    const at = Date.parse(selected);
    const next =
      data.bins.find(
        (b) => Date.parse(b.from) <= at && at < Date.parse(b.to),
      ) ?? data.bins.at(-1);
    setSelected(next?.from ?? null);
    if (next && focusedLane.current && document.activeElement === document.body)
      refs.current.get(`${focusedLane.current}:${next.from}`)?.focus();
  }, [data.bins, selected]);
  const active = data.bins.find((b) => b.from === selected) ?? data.bins.at(-1);
  const unknown = data.bins.filter(
    (b) => b.publications === null && b.errors === null,
  ).length;
  useEffect(() => {
    if (!active) return;
    const button = refs.current.get(`publications:${active.from}`);
    const scroller = button?.closest<HTMLElement>(".rf-lanes-scroll");
    if (!button || !scroller) return;
    const item = button.getBoundingClientRect();
    const viewport = scroller.getBoundingClientRect();
    if (item.left < viewport.left || item.right > viewport.right) {
      scroller.scrollLeft +=
        item.left - viewport.left - viewport.width / 2 + item.width / 2;
    }
  }, [active]);
  function navigate(
    event: KeyboardEvent<HTMLButtonElement>,
    i: number,
    series: string,
  ) {
    const next =
      event.key === "ArrowRight"
        ? Math.min(data.bins.length - 1, i + 1)
        : event.key === "ArrowLeft"
          ? Math.max(0, i - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? data.bins.length - 1
              : null;
    if (next === null || !data.bins[next]) return;
    event.preventDefault();
    setSelected(data.bins[next].from);
    refs.current.get(`${series}:${data.bins[next].from}`)?.focus();
  }
  return (
    <section className="rf-activity" aria-labelledby={id}>
      <div className="rf-panel-heading">
        <h2 id={id}>{t("ActivityLanes.recordedActivity")}</h2>
      </div>
      <div className="rf-activity-summary">
        <p>
          <strong>{format(data.publications, numberLocale)}</strong>{" "}
          {t("presentation.publicationUnit", {
            count: data.publications ?? 0,
          })}{" "}
        </p>
        <p data-tone={data.errors ? "danger" : undefined}>
          <strong>{format(data.errors, numberLocale)}</strong>{" "}
          {t("presentation.errorUnit", { count: data.errors ?? 0 })}{" "}
        </p>
        {unknown > 0 ? (
          <p>
            <strong>{unknown}</strong> {t("commonFragments.of")}{" "}
            {data.bins.length} {t("ActivityLanes.intervalsNotCaptured")}
          </p>
        ) : null}
      </div>
      <Tabs defaultValue="chart" className="rf-tabs">
        <TabsList aria-label={t("ActivityLanes.activityRepresentation")}>
          <TabsTrigger value="chart">{t("ActivityLanes.chart")}</TabsTrigger>
          <TabsTrigger value="data">{t("ActivityLanes.exactData")}</TabsTrigger>
        </TabsList>
        <TabsContent value="chart">
          {!data.bins.length ? (
            <p className="rf-meta">{t("insights.noIntervalsReturned")}</p>
          ) : (
            <>
              <div
                className="rf-lanes-scroll"
                style={{ "--rf-bin-count": data.bins.length } as CSSProperties}
              >
                {(["publications", "errors"] as const).map((series) => {
                  const known = data.bins.flatMap((b) =>
                    b[series] === null ? [] : [b[series] as number],
                  );
                  const max = Math.max(1, ...known);
                  return (
                    <div className="rf-lane" key={series} data-series={series}>
                      <div className="rf-lane-heading">
                        <h3>
                          {series === "errors"
                            ? t("ActivityLanes.errors")
                            : t("ActivityLanes.publications")}
                        </h3>
                        <span className="rf-meta">
                          {t("ActivityLanes.countPerIntervalOwnScale0")}
                          {format(max, numberLocale)}
                        </span>
                      </div>
                      <section
                        className="rf-lane-columns"
                        aria-label={t("presentation.arrowIntervals", {
                          series:
                            series === "errors"
                              ? t("ActivityLanes.errors")
                              : t("ActivityLanes.publications"),
                        })}
                      >
                        <div className="rf-lane-axis" aria-hidden="true">
                          <span>{format(max, numberLocale)}</span>
                          <span>0</span>
                        </div>
                        <div
                          className="rf-lane-bars"
                          style={{
                            gridTemplateColumns: `repeat(${data.bins.length}, minmax(0, 1fr))`,
                          }}
                        >
                          {data.bins.map((b, i) => (
                            <button
                              type="button"
                              key={b.from}
                              className="rf-bin"
                              data-series={series}
                              data-selected={active?.from === b.from}
                              data-unknown={b[series] === null}
                              ref={(el) => {
                                const key = `${series}:${b.from}`;
                                if (el) refs.current.set(key, el);
                                else refs.current.delete(key);
                              }}
                              tabIndex={active?.from === b.from ? 0 : -1}
                              onFocus={() => {
                                focusedLane.current = series;
                                setSelected(b.from);
                              }}
                              onBlur={(e) => {
                                if (e.relatedTarget) focusedLane.current = null;
                              }}
                              onKeyDown={(e) => navigate(e, i, series)}
                              onClick={() => setSelected(b.from)}
                              aria-label={t("presentation.intervalSeries", {
                                from: time(b.from, numberLocale),
                                to: time(b.to, numberLocale),
                                series:
                                  series === "errors"
                                    ? t("ActivityLanes.errors")
                                    : t("ActivityLanes.publications"),
                                value: format(b[series], numberLocale),
                              })}
                            >
                              {(b[series] ?? 0) > 0 && (
                                <span
                                  className="rf-bin-bar"
                                  style={{
                                    height: `${((b[series] as number) / max) * 100}%`,
                                  }}
                                />
                              )}
                            </button>
                          ))}
                        </div>
                      </section>
                    </div>
                  );
                })}
              </div>
              <div className="rf-axis-ends">
                <span>{time(data.from, numberLocale)}</span>
                <span>{time(data.to, numberLocale)}</span>
              </div>
              <div className="rf-readout" aria-live="polite" aria-atomic="true">
                {active && (
                  <>
                    <span>
                      {time(active.from, numberLocale)} –{" "}
                      {time(active.to, numberLocale)}
                    </span>
                    <span>
                      {t("ActivityLanes.publications2")}{" "}
                      <strong>
                        {format(active.publications, numberLocale)}
                      </strong>
                    </span>
                    <span>
                      {t("ActivityLanes.errors2")}{" "}
                      <strong>{format(active.errors, numberLocale)}</strong>
                    </span>
                  </>
                )}
              </div>
              <p className="rf-chart-legend">
                <span>
                  {t(
                    "ActivityLanes.dottedBaselineIntervalNotCapturedUnavailableNotZero",
                  )}
                </span>
                {t(
                  "ActivityLanes.lanesUseSeparateCountScalesCompareTimingNotHeight",
                )}
              </p>
            </>
          )}
        </TabsContent>
        <TabsContent value="data">
          <section
            className="rf-table-region"
            aria-label={t("ActivityLanes.exactActivityCounts")}
          >
            <Table aria-label={t("ActivityLanes.activityIntervals")}>
              <caption className="sr-only">
                {t("ActivityLanes.returnedActivityBinsCaptureIsBestEffort")}
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ActivityLanes.interval")}</TableHead>
                  <TableHead>{t("ActivityLanes.publications")}</TableHead>
                  <TableHead>{t("ActivityLanes.errors")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.bins.map((b) => (
                  <TableRow key={b.from}>
                    <TableCell>
                      {time(b.from, numberLocale)}–{time(b.to, numberLocale)}
                    </TableCell>
                    <TableCell>
                      {format(b.publications, numberLocale)}
                    </TableCell>
                    <TableCell>{format(b.errors, numberLocale)}</TableCell>
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
