"use client";

import "./trace-waterfall.css";

import type { dashboardTraceResponse } from "@mobility/contracts";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Layers,
  Search,
  Workflow,
  Wrench,
} from "lucide-react";
import {
  type CSSProperties,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { useUi } from "@/i18n/provider";
import { useDashboard, useDashboardContext } from "@/src/dashboard-client";
import { conversationRefreshInterval } from "@/src/dashboard-polling";
import {
  mergeTraceEvents,
  projectTrace,
  TRACE_EVENT_LIMIT,
  type TraceEvent,
  type TraceOperation,
  traceBar,
  visibleTraceRows,
} from "@/src/trace-waterfall";
import { Instant, State, Technical } from "./shared";
import { TracePayload } from "./trace-payload";

const icons = { turn: Workflow, step: Layers, model: Bot, tool: Wrench };
function milliseconds(value: number, locale: string) {
  return value < 1000
    ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ms`
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value / 1000)} s`;
}
const noEvents: TraceEvent[] = [];

// One existing reader at a time. Pagination is explicit and freezes older pages.
export function TraceWaterfall({
  sessionId,
  turn,
  summary,
  turnOrdinal,
}: {
  sessionId: string;
  turn: string;
  summary: Record<string, unknown>;
  turnOrdinal?: number | undefined;
}) {
  const { t } = useUi();
  const ctx = useDashboardContext();
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<TraceEvent[]>([]);
  const result = useDashboard(
    `conversations/${sessionId}/events?${new URLSearchParams({ limit: "100", ...(turn ? { turn } : {}), ...(cursor ? { cursor } : {}) })}`,
    cursor ? 0 : conversationRefreshInterval(summary, 3000),
  );
  const page = (
    result.data as z.infer<typeof dashboardTraceResponse> | undefined
  )?.data;
  const events = useMemo(
    () => mergeTraceEvents(previous, page?.events ?? noEvents),
    [previous, page?.events],
  );
  const available = Boolean(page) || events.length > 0;
  return (
    <div className="dc-stack mt-4">
      <State
        data={result.data}
        loading={result.isLoading}
        error={result.error}
        empty={!events.length}
      />
      {available ? (
        <p className="dc-trace-notice">
          {t("waterfall.coverage", {
            events: events.length,
            omitted:
              typeof summary.omittedEvents === "number"
                ? summary.omittedEvents
                : "—",
            gaps:
              typeof summary.knownGaps === "number" ? summary.knownGaps : "—",
          })}
        </p>
      ) : null}
      {cursor ? (
        <p className="dc-trace-notice">{t("waterfall.frozen")}</p>
      ) : null}
      {available ? (
        <WaterfallChart
          events={events}
          sessionId={sessionId}
          partial={
            Boolean(page?.nextCursor) ||
            Boolean(result.error) ||
            Boolean(cursor && !page)
          }
          filteredTurn={turn}
          turnOrdinal={turnOrdinal}
        />
      ) : null}
      <div className="dc-session-actions">
        {page?.nextCursor ? (
          <Button
            variant="outline"
            disabled={
              events.length >= TRACE_EVENT_LIMIT ||
              result.isValidating ||
              ctx.paused ||
              !ctx.visible
            }
            onClick={() => {
              setPrevious(events);
              setCursor(page.nextCursor);
            }}
          >
            {t("waterfall.loadMore")}
          </Button>
        ) : null}
        {cursor || result.error ? (
          <Button
            variant="outline"
            disabled={ctx.paused || !ctx.visible}
            onClick={() => {
              setPrevious([]);
              setCursor(null);
              if (!cursor) void result.mutate();
            }}
          >
            {t("waterfall.restart")}
          </Button>
        ) : null}
        {events.length >= TRACE_EVENT_LIMIT && page?.nextCursor ? (
          <p className="dc-meta">{t("waterfall.limit")}</p>
        ) : null}
      </div>
    </div>
  );
}

export function WaterfallChart({
  events,
  sessionId,
  partial = false,
  filteredTurn = "",
  turnOrdinal,
}: {
  events: TraceEvent[];
  sessionId: string;
  partial?: boolean;
  filteredTurn?: string;
  turnOrdinal?: number | undefined;
}) {
  const { t, numberLocale } = useUi();
  const tree = useMemo(() => projectTrace(events), [events]);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const searching = query.trim().length > 0;
  const searchId = useId(),
    detailId = useId();
  const turnNumbers = useMemo(() => {
    const ids = new Map<string, number>();
    for (const e of events)
      if (e.turnId && !ids.has(e.turnId)) ids.set(e.turnId, ids.size + 1);
    return ids;
  }, [events]);
  function label(o: TraceOperation) {
    if (o.kind === "turn")
      return t("waterfall.turn", {
        index: filteredTurn
          ? (turnOrdinal ?? o.event.turnId?.slice(-6) ?? "—")
          : (turnNumbers.get(o.event.turnId ?? "") ?? "—"),
      });
    if (o.kind === "step")
      return t("waterfall.step", {
        index: o.event.stepIndex === null ? "—" : o.event.stepIndex + 1,
      });
    if (o.kind === "tool")
      return (
        o.event.toolIdentity?.canonicalName ??
        o.event.tool ??
        t("waterfall.tool")
      );
    return o.event.purpose === "compaction"
      ? t("waterfall.compaction")
      : t("waterfall.model");
  }
  const visible = visibleTraceRows(tree.roots, collapsed, query, label);
  const selected =
    visible.find((row) => row.operation.id === selection)?.operation ??
    visible[0]?.operation;
  const focused = tree.operations.find((o) => o.id === focus && o.span);
  const start = focused?.start ?? tree.start,
    end = focused?.end ?? tree.end;
  const time = (n: number) => milliseconds(n, numberLocale);
  const spans = tree.operations.filter((o) => o.span).length;
  return (
    <section className="dc-trace" aria-label={t("waterfall.title")}>
      <header className="dc-trace-heading">
        <div>
          <h2>{t("waterfall.title")}</h2>
          <p>{t("waterfall.subtitle")}</p>
        </div>
        <span className="dc-trace-count">
          {t("waterfall.count", { spans, operations: tree.operations.length })}
        </span>
      </header>
      <div className="dc-trace-toolbar">
        <label className="dc-trace-search" htmlFor={searchId}>
          <Search aria-hidden="true" />
          <span className="sr-only">{t("waterfall.search")}</span>
          <input
            id={searchId}
            type="search"
            placeholder={t("waterfall.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(new Set())}
        >
          {t("waterfall.expand")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setCollapsed(
              new Set(
                tree.operations
                  .filter((o) => o.children.length)
                  .map((o) => o.id),
              ),
            )
          }
        >
          {t("waterfall.collapse")}
        </Button>
        {focused ? (
          <Button variant="outline" size="sm" onClick={() => setFocus(null)}>
            {t("waterfall.resetZoom")}
          </Button>
        ) : null}
      </div>
      <div className="dc-trace-legend">
        {(["turn", "step", "model", "tool"] as const).map((kind) => (
          <span key={kind} data-kind={kind}>
            <i aria-hidden="true" />
            {t(`waterfall.${kind}Kind`)}
          </span>
        ))}
        <span>{t("waterfall.marker")}</span>
      </div>
      {partial ? (
        <p className="dc-trace-notice">{t("waterfall.partial")}</p>
      ) : null}
      <div className="dc-trace-workspace">
        <section
          className="dc-trace-scroll"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: overflow region requires keyboard scrolling.
          tabIndex={0}
          aria-label={t("waterfall.chart")}
        >
          <div className="dc-trace-grid">
            <div className="dc-trace-axis">
              <span>{t("waterfall.operation")}</span>
              <div>
                {[0, 1, 2, 3, 4].map((tick) => (
                  <span key={tick} style={{ left: `${tick * 25}%` }}>
                    {time(((end - start) * tick) / 4)}
                  </span>
                ))}
              </div>
              <span>{t("waterfall.duration")}</span>
            </div>
            <ul className="dc-trace-rows">
              {visible.map(({ operation: o, depth }) => {
                const Icon = icons[o.kind],
                  bar = traceBar(o, start, end);
                const state = o.terminal
                  ? t(`waterfall.${o.event.status}`)
                  : t("waterfall.noTerminal");
                return (
                  <li
                    key={o.id}
                    className="dc-trace-row"
                    data-kind={o.kind}
                    data-selected={selected?.id === o.id}
                    style={{ "--trace-depth": depth } as CSSProperties}
                  >
                    <div className="dc-trace-label">
                      {o.children.length ? (
                        <button
                          type="button"
                          className="dc-trace-toggle"
                          aria-label={t("waterfall.toggle", { name: label(o) })}
                          aria-expanded={
                            searching ? true : !collapsed.has(o.id)
                          }
                          disabled={searching}
                          onClick={() =>
                            setCollapsed((before) => {
                              const next = new Set(before);
                              if (next.has(o.id)) next.delete(o.id);
                              else next.add(o.id);
                              return next;
                            })
                          }
                        >
                          {collapsed.has(o.id) && !searching ? (
                            <ChevronRight />
                          ) : (
                            <ChevronDown />
                          )}
                        </button>
                      ) : (
                        <span className="dc-trace-toggle" />
                      )}
                      <button
                        type="button"
                        className="dc-trace-select"
                        aria-pressed={selected?.id === o.id}
                        aria-controls={detailId}
                        title={`${label(o)} · ${state}`}
                        onClick={() => setSelection(o.id)}
                      >
                        <Icon aria-hidden="true" />
                        <span>{label(o)}</span>
                        <span className="sr-only"> · {state}</span>
                        {o.event.status === "failed" ||
                        o.event.status === "rejected" ||
                        o.event.status === "cancelled" ? (
                          <span className="dc-trace-failure">!</span>
                        ) : null}
                      </button>
                    </div>
                    <button
                      type="button"
                      className="dc-trace-track"
                      aria-label={t("waterfall.inspect", {
                        name: label(o),
                        time: o.span
                          ? time(o.span.durationMs)
                          : t("waterfall.noSpan"),
                      })}
                      aria-controls={detailId}
                      onClick={() => setSelection(o.id)}
                    >
                      {bar ? (
                        <span
                          className={o.span ? "dc-trace-bar" : "dc-trace-point"}
                          style={{
                            left: `${bar.left}%`,
                            width: o.span ? `${bar.width}%` : undefined,
                          }}
                        />
                      ) : (
                        <span className="dc-trace-outside">
                          {t("waterfall.outside")}
                        </span>
                      )}
                    </button>
                    <span className="dc-trace-duration">
                      {o.span ? time(o.span.durationMs) : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {!visible.length ? (
              <p className="dc-trace-empty">
                {t(events.length ? "waterfall.noMatches" : "waterfall.empty")}
              </p>
            ) : null}
          </div>
        </section>
        <aside
          id={detailId}
          className="dc-trace-inspector"
          aria-label={t("waterfall.inspector")}
        >
          {selected ? (
            <TraceDetail
              key={selected.id}
              operation={selected}
              title={label(selected)}
              sessionId={sessionId}
              start={start}
              onFocus={() => setFocus(selected.id)}
            />
          ) : (
            <p>{t("waterfall.select")}</p>
          )}
        </aside>
      </div>
      <footer className="dc-trace-footer">
        {t("waterfall.scale", { duration: time(end - start) })}{" "}
        {t("waterfall.noSum")}
      </footer>
    </section>
  );
}

function TraceDetail({
  operation: o,
  title,
  sessionId,
  start,
  onFocus,
}: {
  operation: TraceOperation;
  title: string;
  sessionId: string;
  start: number;
  onFocus: () => void;
}) {
  const { t, numberLocale } = useUi();
  const ctx = useDashboardContext();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [payload, setPayload] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const time = (n: number) => milliseconds(n, numberLocale);
  const count = (n: number | null) =>
    n === null
      ? t("waterfall.unknown")
      : new Intl.NumberFormat(numberLocale).format(n);
  const e = o.event;
  return (
    <>
      <div className="dc-trace-detail-title" data-kind={o.kind}>
        <span>{t(`waterfall.${o.kind}Kind`)}</span>
        <h3>{title}</h3>
        <p data-status={e.status}>
          {o.terminal ? t(`waterfall.${e.status}`) : t("waterfall.noTerminal")}
        </p>
      </div>
      <dl className="dc-trace-metrics">
        <div>
          <dt>{t("waterfall.duration")}</dt>
          <dd>{o.span ? time(o.span.durationMs) : "—"}</dd>
        </div>
        <div>
          <dt>{t("waterfall.offset")}</dt>
          <dd>{time(o.start - start)}</dd>
        </div>
        <div className="dc-trace-wide">
          <dt>{t(o.span ? "waterfall.start" : "waterfall.observed")}</dt>
          <dd>
            <Instant value={o.span?.startedAt ?? e.occurredAt} />
          </dd>
        </div>
        {o.span ? (
          <div className="dc-trace-wide">
            <dt>{t("waterfall.end")}</dt>
            <dd>
              <Instant value={o.span.endedAt} />
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="dc-meta">
        {t(o.span ? "waterfall.nativeDuration" : "waterfall.noSpanDetail")}
      </p>
      {!o.span && e.durationMs !== null ? (
        <p className="dc-meta">
          {t("waterfall.eventDuration", { duration: time(e.durationMs) })}
        </p>
      ) : null}
      {o.span ? (
        <Button variant="outline" size="sm" onClick={onFocus}>
          {t("waterfall.focus")}
        </Button>
      ) : null}
      <div className="dc-trace-detail-section">
        <h4>{t("waterfall.relationship")}</h4>
        <p>{t(`waterfall.${o.relation}Relation`)}</p>
        {o.span?.parentSpanId && o.relation !== "native" ? (
          <p className="dc-meta">{t("waterfall.absentParent")}</p>
        ) : null}
      </div>
      {o.kind === "model" ? (
        <div className="dc-trace-detail-section">
          <h4>{t("waterfall.reportedUsage")}</h4>
          <dl className="dc-trace-metrics">
            <div>
              <dt>{t("waterfall.input")}</dt>
              <dd>{count(e.inputTokens)}</dd>
            </div>
            <div>
              <dt>{t("waterfall.output")}</dt>
              <dd>{count(e.outputTokens)}</dd>
            </div>
            <div>
              <dt>{t("waterfall.cache")}</dt>
              <dd>{count(e.cachedInputTokens)}</dd>
            </div>
            <div>
              <dt>{t("waterfall.reasoning")}</dt>
              <dd>{count(e.reasoningTokens)}</dd>
            </div>
          </dl>
          <p className="dc-meta">{t("waterfall.usageHelp")}</p>
        </div>
      ) : null}
      <div className="dc-trace-detail-section">
        <h4>{t("waterfall.events", { count: o.events.length })}</h4>
        <ul className="dc-trace-event-list">
          {o.events.map((event) => (
            <li key={event.id}>
              <code>{event.kind}</code>
              <Instant value={event.occurredAt} />
              {event.payloadIds.map((id, index) => (
                <Button
                  key={id}
                  variant="outline"
                  size="sm"
                  disabled={pending || ctx.paused || !ctx.visible}
                  onClick={async () => {
                    setPending(true);
                    setFailed(false);
                    setPayload(null);
                    try {
                      const response = (await ctx.request(
                        `conversations/${sessionId}/payloads/${id}`,
                      )) as { data: unknown };
                      if (alive.current) setPayload(response.data);
                    } catch {
                      if (alive.current) setFailed(true);
                    } finally {
                      if (alive.current) setPending(false);
                    }
                  }}
                >
                  {t("waterfall.content", { index: index + 1 })}
                </Button>
              ))}
            </li>
          ))}
        </ul>
        {pending ? <p role="status">{t("waterfall.loading")}</p> : null}
        {failed ? <p role="alert">{t("waterfall.unavailable")}</p> : null}
        {payload ? (
          <>
            <TracePayload value={payload} />
            <Button variant="ghost" size="sm" onClick={() => setPayload(null)}>
              {t("conversationView.closeContent")}
            </Button>
          </>
        ) : null}
      </div>
      <Technical value={{ otel: o.span, events: o.events }} />
    </>
  );
}
