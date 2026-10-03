"use client";
import { dashboardToolName } from "@mobility/contracts";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useDashboard, useDashboardContext } from "@/src/dashboard-client";
import { number } from "./insights";
import { Empty, Segmented, Sheet, Tabs } from "./primitives";
import { UsagePerTurnRows } from "./refinement/UsagePerTurnRows";
import { Instant, PageTitle, State, Technical } from "./shared";
import { toolCopy } from "./tool-form";
import { TracePayload } from "./trace-payload";

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const rows = (v: unknown) => (Array.isArray(v) ? v.map(obj) : []);
const unwrap = (v: unknown) => obj(obj(v).data);
const titles: Record<string, string> = {
  turn_started: "Turn started",
  turn_completed: "Turn completed",
  turn_failed: "Turn failed",
  turn_cancelled: "Turn cancelled",
  step_started: "Step started",
  step_completed: "Step completed",
  attempt_prepared: "Request prepared (not dispatched)",
  attempt_dispatched: "Request dispatched to model",
  attempt_completed: "Model response",
  attempt_incomplete: "Incomplete response",
  attempt_failed: "Attempt failed",
  attempt_cancelled: "Attempt cancelled",
  tool_requested: "Tool requested",
  tool_result: "Tool result",
  tool_rejected: "Tool rejected",
  tool_cancelled: "Tool cancelled",
};
const states: Record<string, string> = {
  running: "Running",
  succeeded: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  rejected: "Rejected",
  unknown: "Unknown state",
  prepared: "Prepared",
  incomplete: "Incomplete",
};
export function Conversations({ sessionId }: { sessionId?: string }) {
  const ctx = useDashboardContext();
  const [cursor, setCursor] = useState<string | null>(null),
    [tab, setTab] = useState("Timeline"),
    [turn, setTurn] = useState(""),
    [call, setCall] = useState(""),
    [payload, setPayload] = useState<unknown>(null);
  const [retentionOpen, setRetentionOpen] = useState(false);
  const requestSelection = useRef("");
  requestSelection.current = `${sessionId}:${tab}:${turn}:${call}`;
  const [turnCursor, setTurnCursor] = useState<string | null>(null);
  const previousSession = useRef(sessionId);
  useEffect(() => {
    if (previousSession.current === sessionId) return;
    previousSession.current = sessionId;
    setTurnCursor(null);
    setCursor(null);
    setTurn("");
    setCall("");
    setPayload(null);
    setTab("Timeline");
  }, [sessionId]);
  const index = useDashboard(
    !sessionId
      ? `conversations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`
      : "conversations",
    0,
    !sessionId,
  );
  const summary = useDashboard(
    sessionId
      ? `conversations/${sessionId}/summary${turnCursor ? `?turnCursor=${encodeURIComponent(turnCursor)}` : ""}`
      : null,
    turnCursor ? 0 : 3000,
    Boolean(sessionId),
  );
  const s = unwrap(summary.data),
    usage = obj(s.usage),
    counts = obj(s.counts),
    turns = rows(s.turns);
  const events = useDashboard(
    sessionId
      ? `conversations/${sessionId}/events?${new URLSearchParams({ ...(cursor ? { cursor } : {}), ...(turn ? { turn } : {}), ...(call && tab === "Tools" ? { call } : {}), ...(tab === "Tools" ? { family: "tools" } : tab === "Model" ? { family: "model" } : tab === "Content" ? { family: "content" } : {}) })}`
      : null,
    s.state === "running" && !cursor ? 3000 : 0,
  );
  const data = unwrap(sessionId ? events.data : index.data),
    entries = rows(sessionId ? data.events : data.sessions);
  const picked = turns.find((r) => r.turnId === turn);
  return (
    <>
      <PageTitle
        title="My conversations"
        description="Inspect your sessions, captured tool calls and reported usage."
      />
      <div className="dc-conversation-workspace">
        {sessionId ? (
          <aside className="dc-session-index dc-card">
            <h2>Sessions on this page</h2>
            {rows(unwrap(index.data).sessions).map((e) => (
              <Link
                key={String(e.sessionId)}
                href={`/dashboard/conversations/${e.sessionId}`}
                className="dc-tool-row"
                aria-current={e.sessionId === sessionId ? "page" : undefined}
              >
                <strong>Conversation</strong>
                <p>
                  <Instant value={e.createdAt} />
                </p>
              </Link>
            ))}
          </aside>
        ) : null}
        <div className="dc-stack">
          {sessionId ? (
            <>
              <div className="flex flex-wrap gap-5 text-sm">
                <Link href="/dashboard/conversations" className="underline">
                  All my conversations
                </Link>
                <Link href={`/s/${sessionId}`} className="underline">
                  Open chat
                </Link>
              </div>
              <State
                data={summary.data}
                loading={summary.isLoading}
                error={summary.error}
              />
              {turnCursor && summary.error?.status === 409 ? (
                <Button variant="outline" onClick={() => setTurnCursor(null)}>
                  Capture revision changed: return to first turn page
                </Button>
              ) : null}
              {call ? (
                <p className="text-sm">
                  Showing the call linked to model-transport content.{" "}
                  <Button variant="ghost" onClick={() => setCall("")}>
                    View all calls
                  </Button>
                </p>
              ) : null}
              <div className="dc-turn-selector">
                <Segmented
                  label="Turn (returned page)"
                  value={turn}
                  onChange={(v) => {
                    setTurn(v);
                    setCursor(null);
                    setPayload(null);
                    setCall("");
                  }}
                  options={[
                    ["", "All returned turns"],
                    ...turns.map(
                      (t, i) =>
                        [
                          String(t.turnId),
                          `Turn ${i + 1} · ${states[String(t.state)] ?? "Unknown"}`,
                        ] as const,
                    ),
                  ]}
                />
              </div>
              <Tabs.Root
                value={tab}
                onValueChange={(value) => {
                  setTab(value);
                  setCursor(null);
                  setPayload(null);
                  setCall("");
                }}
              >
                <Tabs.List
                  aria-label="Conversation detail"
                  className="flex flex-wrap gap-2"
                >
                  {["Timeline", "Tools", "Usage", "Model", "Content"].map(
                    (t) => (
                      <Tabs.Trigger
                        key={t}
                        value={t}
                        className="min-h-11 rounded-md px-4 text-sm data-[state=active]:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {t}
                      </Tabs.Trigger>
                    ),
                  )}
                </Tabs.List>
                <Tabs.Content value="Usage" className="dc-stack mt-4">
                  {" "}
                  <section
                    className="grid divide-y rounded-lg border bg-card sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4"
                    aria-label="Conversation summary"
                  >
                    {[
                      [
                        "Reported tokens",
                        number(usage.totalTokens),
                        "Only attempts with known input and output. Cache and reasoning subsets are not added again.",
                      ],
                      [
                        "Tool calls",
                        number(counts.tools),
                        "Each call counted once, even across multiple events. Excludes discovery and manual executions.",
                      ],
                      [
                        "Dispatched model attempts",
                        number(counts.dispatched),
                        "Observed dispatches; retries and compactions are distinct attempts.",
                      ],
                      [
                        "Turn duration",
                        picked?.state === "running"
                          ? "Running"
                          : picked?.durationMs != null
                            ? `${number(picked.durationMs)} ms`
                            : "Unknown",
                        turn
                          ? "Instrumented start to terminal, not a sum of attempts."
                          : "Select a turn to inspect duration.",
                      ],
                    ].map(([label, value, help]) => (
                      <article
                        key={label}
                        className="p-5 sm:border-r last:border-r-0"
                      >
                        <h2 className="text-sm text-muted-foreground">
                          {label}
                        </h2>
                        <p className="my-3 text-2xl font-semibold tabular-nums">
                          {value}
                        </p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {help}
                        </p>
                      </article>
                    ))}
                  </section>
                  <p className="text-sm text-muted-foreground">
                    Input: {number(usage.inputTokens)} · Output:{" "}
                    {number(usage.outputTokens)} ·{" "}
                    {Number(counts.missing ?? 0) > 0
                      ? `${number(counts.missing)} attempts without complete reported usage.`
                      : "Usage depends on fields actually reported."}
                  </p>
                  <dl className="flex flex-wrap gap-5 text-xs text-muted-foreground">
                    {[
                      ["Input", "input", usage.inputTokens],
                      ["Output", "output", usage.outputTokens],
                      [
                        "Cache (input subset)",
                        "cache",
                        usage.cachedInputTokens,
                      ],
                      [
                        "Reported reasoning (subset, no content)",
                        "reasoning",
                        usage.reasoningTokens,
                      ],
                    ].map(([label, field, value]) => (
                      <div key={String(field)}>
                        <dt>{String(label)}</dt>
                        <dd>
                          {number(value)} · reported in{" "}
                          {number(
                            obj(obj(usage.coverage)[String(field)]).reported,
                          )}{" "}
                          de{" "}
                          {number(
                            obj(obj(usage.coverage)[String(field)]).observed,
                          )}{" "}
                          retained attempts
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    Tools: {number(counts.toolRequested)} requested ·{" "}
                    {number(counts.toolExecuted)} with result ·{" "}
                    {number(counts.toolFailed)} failed ·{" "}
                    {number(counts.toolRejected)} rejected ·{" "}
                    {number(counts.toolCancelled)} cancelled ·{" "}
                    {number(counts.toolPending)} pending in capture. Missing
                    events do not prove non-execution.
                  </p>
                  <section className="rounded-lg border bg-card p-5">
                    <h2 className="text-base font-semibold">
                      Reported usage by turn
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Up to 50 turns per page. Session totals cover all retained
                      attempts. Unknown is not zero.
                    </p>
                    <UsagePerTurnRows
                      turns={turns.map((r, i) => ({
                        id: String(r.turnId),
                        label: `Turn ${i + 1}`,
                        usage: {
                          input:
                            typeof r.inputTokens === "number"
                              ? r.inputTokens
                              : null,
                          output:
                            typeof r.outputTokens === "number"
                              ? r.outputTokens
                              : null,
                          cachedInput:
                            typeof r.cachedInputTokens === "number"
                              ? r.cachedInputTokens
                              : null,
                          reasoningOutput:
                            typeof r.reasoningTokens === "number"
                              ? r.reasoningTokens
                              : null,
                        },
                      }))}
                    />
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr>
                            <th className="p-2">Turn</th>
                            <th className="p-2">Input</th>
                            <th className="p-2">Output</th>
                            <th className="p-2">Duration</th>
                            <th className="p-2">Coverage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {turns.map((r, i) => (
                            <tr key={String(r.turnId)} className="border-t">
                              <td className="p-2">
                                <Button
                                  variant={
                                    turn === r.turnId ? "secondary" : "ghost"
                                  }
                                  onClick={() => {
                                    setTurn(
                                      turn === r.turnId ? "" : String(r.turnId),
                                    );
                                    setCursor(null);
                                    setPayload(null);
                                  }}
                                  aria-pressed={turn === r.turnId}
                                >
                                  Turn {i + 1}
                                </Button>
                              </td>
                              <td className="p-2 tabular-nums">
                                {number(r.inputTokens)}
                              </td>
                              <td className="p-2 tabular-nums">
                                {number(r.outputTokens)}
                              </td>
                              <td className="p-2">
                                {r.state === "running"
                                  ? "Running"
                                  : r.durationMs != null
                                    ? `${number(r.durationMs)} ms`
                                    : "No measurement"}
                              </td>
                              <td className="p-2">
                                {number(obj(obj(r.coverage).total).reported)} of{" "}
                                {number(r.attempts)} attempts with complete
                                usage
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!turns.length ? (
                      <p className="py-4 text-sm">
                        No retained instrumented turns to plot.
                      </p>
                    ) : null}
                  </section>
                  <p className="text-xs text-muted-foreground">
                    {number(s.totalTurns)} turns with retained evidence. Up to
                    50 per page; session totals include all retained attempts.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {typeof s.nextTurnCursor === "string" ? (
                      <Button
                        variant="outline"
                        onClick={() => setTurnCursor(String(s.nextTurnCursor))}
                      >
                        Next turn page
                      </Button>
                    ) : null}
                    {turnCursor ? (
                      <Button
                        variant="ghost"
                        onClick={() => setTurnCursor(null)}
                      >
                        First turn page
                      </Button>
                    ) : null}
                  </div>
                </Tabs.Content>
                {tab !== "Usage" ? (
                  <Tabs.Content
                    value={tab}
                    className="mt-4 flex flex-col gap-3"
                  >
                    <State
                      data={events.data}
                      loading={events.isLoading}
                      error={events.error}
                      empty={false}
                    />
                    {entries.map((e) => (
                      <article
                        key={String(e.id)}
                        className="rounded-lg border bg-card p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-medium">
                              {titles[String(e.kind)] ?? "Recorded event"}
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {states[String(e.status)] ??
                                "State not confirmed"}
                              {e.tool
                                ? ` · ${obj(e.toolIdentity).family === "discovery" ? "Tool discovery" : dashboardToolName.safeParse(obj(e.toolIdentity).canonicalName).success ? toolCopy[dashboardToolName.parse(obj(e.toolIdentity).canonicalName)].title : "Registered tool"}`
                                : ""}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            <Instant value={e.occurredAt} />
                          </span>
                        </div>
                        {e.durationMs != null ? (
                          <p className="mt-2 text-sm tabular-nums">
                            Recorded duration: {number(e.durationMs)} ms
                          </p>
                        ) : null}
                        {e.kind && String(e.kind).startsWith("attempt_") ? (
                          <p className="mt-2 text-sm">
                            Reported tokens: {number(e.inputTokens)} input /{" "}
                            {number(e.outputTokens)} output. Cannot infer which
                            evidence influenced the response.
                          </p>
                        ) : null}
                        <p className="mt-2 text-xs text-muted-foreground">
                          {e.captureStatus === "captured"
                            ? "Captured sanitized content"
                            : e.captureStatus === "partial"
                              ? "Partial capture; content may be missing"
                              : "Content not recorded or omitted; uncaptured content cannot be recovered."}
                        </p>
                        {Array.isArray(e.sentCallIds) &&
                        e.sentCallIds.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {e.sentCallIds.map((id, i) => (
                              <Button
                                key={String(id)}
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setTab("Tools");
                                  setCall(String(id));
                                  setTurn(String(e.turnId ?? ""));
                                  setCursor(null);
                                  setPayload(null);
                                }}
                              >
                                Inspect tool result sent to model {i + 1}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(Array.isArray(e.payloadIds)
                            ? e.payloadIds
                            : []
                          ).map((id) => (
                            <Button
                              key={String(id)}
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                const requested = requestSelection.current;
                                try {
                                  const result = await ctx.request(
                                    `conversations/${sessionId}/payloads/${id}`,
                                  );
                                  if (requestSelection.current === requested)
                                    setPayload(unwrap(result));
                                } catch {
                                  if (requestSelection.current === requested)
                                    setPayload({
                                      warning:
                                        "Content expired or unavailable.",
                                    });
                                }
                              }}
                            >
                              Open sanitized content
                            </Button>
                          ))}
                        </div>
                        <div className="mt-3">
                          <Technical value={e} />
                        </div>
                      </article>
                    ))}
                  </Tabs.Content>
                ) : null}
              </Tabs.Root>
              <Technical value={s} />
            </>
          ) : (
            <>
              <State
                data={index.data}
                loading={index.isLoading}
                error={index.error}
                empty={false}
              />
              {!index.isLoading && !index.error && !entries.length ? (
                <Empty title="No captured conversations yet">
                  <p>
                    Open chat to start a conversation. Only your sessions with
                    current access appear here; missing capture is not
                    reconstructed.
                  </p>
                  <Button asChild>
                    <Link href="/s">Open chat</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setRetentionOpen(true)}
                  >
                    Capture and retention
                  </Button>
                </Empty>
              ) : null}
              {entries.length ? (
                <div className="overflow-hidden dc-card">
                  {entries.map((e, i) => (
                    <article
                      key={String(e.sessionId)}
                      className="flex flex-wrap items-center justify-between gap-4 border-b p-5 last:border-b-0"
                    >
                      <div>
                        <h2 className="text-sm font-medium">
                          Conversation {i + 1}
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Created: <Instant value={e.createdAt} /> ·{" "}
                          {e.captureStatus === "not_instrumented"
                            ? "Not instrumented"
                            : "Best-effort capture"}
                        </p>
                      </div>
                      <div className="flex gap-4 text-sm">
                        <Link
                          className="inline-flex min-h-11 items-center underline"
                          href={`/s/${e.sessionId}`}
                        >
                          Open chat
                        </Link>
                        <Link
                          className="inline-flex min-h-11 items-center underline"
                          href={`/dashboard/conversations/${e.sessionId}`}
                        >
                          Inspect conversation
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
      {typeof data.nextCursor === "string" ? (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => setCursor(String(data.nextCursor))}
        >
          Next page
        </Button>
      ) : null}
      {payload ? (
        <div>
          <TracePayload value={payload} />
          <Button
            variant="ghost"
            className="mt-3"
            onClick={() => setPayload(null)}
          >
            Close content
          </Button>
        </div>
      ) : null}
      <Sheet
        open={retentionOpen}
        onOpenChange={setRetentionOpen}
        title="Capture and retention"
        trigger={
          <Button variant="ghost" className="self-start">
            Capture and retention
          </Button>
        }
      >
        <p className="dc-meta">
          Up to seven days. Per session: 16 MiB and 10,000 events; per
          evaluator: 256 MiB. Model input 512 KB, output 64 KB; arguments 8 KB
          and results 32 KB. Sanitized capture can be partial, missing or
          expired. No cost estimates or historical reconstruction.
        </p>
      </Sheet>
    </>
  );
}
