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

const format = (v: number | null) =>
  v === null ? "Unavailable" : new Intl.NumberFormat("en-GB").format(v);
const time = (v: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(v));

/** Local plot rendering; shadcn provides tabs/table. No extra data requests. */
export function ActivityLanes({ data }: { data: DashboardActivityChart }) {
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
        <h2 id={id}>Recorded activity</h2>
        <span className="rf-meta">Europe/Madrid</span>
      </div>
      <p className="rf-coverage">
        {format(data.publications)} publications · {format(data.errors)} errors
        · best-effort capture
      </p>
      <Tabs defaultValue="chart" className="rf-tabs">
        <TabsList aria-label="Activity representation">
          <TabsTrigger value="chart">Chart</TabsTrigger>
          <TabsTrigger value="data">Exact data</TabsTrigger>
        </TabsList>
        <TabsContent value="chart">
          {!data.bins.length ? (
            <p className="rf-meta">No intervals returned.</p>
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
                    <div className="rf-lane" key={series}>
                      <div className="rf-lane-heading">
                        <h3>
                          {series === "errors" ? "Errors" : "Publications"}
                        </h3>
                        <span className="rf-meta">
                          Count · own scale · 0–{format(max)}
                        </span>
                      </div>
                      <section
                        className="rf-lane-columns"
                        aria-label={`${series}. Arrow keys select an interval.`}
                      >
                        <div className="rf-lane-axis" aria-hidden="true">
                          <span>{format(max)}</span>
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
                              aria-label={`${time(b.from)} to ${time(b.to)}; ${series}: ${format(b[series])}`}
                            >
                              {b[series] !== null && (
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
                <span>{time(data.from)}</span>
                <span>{time(data.to)}</span>
              </div>
              <div className="rf-readout" aria-live="polite" aria-atomic="true">
                {active && (
                  <>
                    {time(active.from)}–{time(active.to)} · Publications:{" "}
                    {format(active.publications)} · Errors:{" "}
                    {format(active.errors)}
                  </>
                )}
              </div>
              <p className="rf-meta">
                Striped intervals are unavailable, not zero. Heights use
                separate count scales; compare timing, not height between lanes.
              </p>
            </>
          )}
        </TabsContent>
        <TabsContent value="data">
          <section
            className="rf-table-region"
            aria-label="Exact activity counts"
          >
            <Table>
              <caption className="sr-only">
                Returned activity bins. Capture is best-effort.
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Interval</TableHead>
                  <TableHead>Publications</TableHead>
                  <TableHead>Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.bins.map((b) => (
                  <TableRow key={b.from}>
                    <TableCell>
                      {time(b.from)}–{time(b.to)}
                    </TableCell>
                    <TableCell>{format(b.publications)}</TableCell>
                    <TableCell>{format(b.errors)}</TableCell>
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
