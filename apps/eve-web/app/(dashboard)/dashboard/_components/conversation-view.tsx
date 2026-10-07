"use client";

import { dashboardToolName } from "@mobility/contracts";
import { Info, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useUi } from "@/i18n/provider";
import { useDashboard, useDashboardContext } from "@/src/dashboard-client";
import { number } from "./insights";
import { Empty, Segmented, Sheet, Table, Tabs } from "./primitives";
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
  const { t, copy, numberLocale } = useUi();

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
      <div className="dc-overview-heading">
        <PageTitle
          title={t("conversationView.myConversations")}
          description={t(
            "conversationView.inspectYourSessionsCapturedToolCallsAndReportedUsage",
          )}
        />
        <Sheet
          open={retentionOpen}
          onOpenChange={setRetentionOpen}
          title={t("conversationView.captureAndRetention")}
          trigger={
            <Button variant="ghost" size="sm">
              <Info aria-hidden="true" />
              {t("conversationView.captureAndRetention")}
            </Button>
          }
        >
          <p className="dc-meta">
            {t("conversationView.upToSevenDaysPerSession16MibAnd")}
          </p>
        </Sheet>
      </div>
      <div className="dc-conversation-workspace">
        {sessionId ? (
          <aside className="dc-session-index dc-card">
            <h2>{t("conversationView.sessionsOnThisPage")}</h2>
            {rows(unwrap(index.data).sessions).map((e) => (
              <Link
                key={String(e.sessionId)}
                href={`/dashboard/conversations/${e.sessionId}`}
                className="dc-tool-row"
                aria-current={e.sessionId === sessionId ? "page" : undefined}
              >
                <strong>{t("conversationView.conversation")}</strong>
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
              <div className="dc-session-actions">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/dashboard/conversations">
                    {t("conversationView.allMyConversations")}
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/s/${sessionId}`}>
                    {t("conversationView.openChat")}
                  </Link>
                </Button>
              </div>
              <State
                data={summary.data}
                loading={summary.isLoading}
                error={summary.error}
              />
              {turnCursor && summary.error?.status === 409 ? (
                <Button variant="outline" onClick={() => setTurnCursor(null)}>
                  {t(
                    "conversationView.captureRevisionChangedReturnToFirstTurnPage",
                  )}
                </Button>
              ) : null}
              {call ? (
                <p className="text-sm">
                  {t(
                    "conversationView.showingTheCallLinkedToModelTransportContent",
                  )}{" "}
                  <Button variant="ghost" onClick={() => setCall("")}>
                    {t("conversationView.viewAllCalls")}
                  </Button>
                </p>
              ) : null}
              <div className="dc-turn-selector">
                <Segmented
                  label={t("conversationView.turnReturnedPage")}
                  value={turn}
                  onChange={(v) => {
                    setTurn(v);
                    setCursor(null);
                    setPayload(null);
                    setCall("");
                  }}
                  options={[
                    ["", t("conversationView.allReturnedTurns")],
                    ...turns.map(
                      (turnRow, i) =>
                        [
                          String(turnRow.turnId),
                          `${t("presentation.turn", { count: i + 1 })} · ${copy(states[String(turnRow.state)]) ?? copy("Unknown")}`,
                        ] as const,
                    ),
                  ]}
                />
              </div>
              <Tabs.Root
                className="dc-tabs"
                value={tab}
                onValueChange={(value) => {
                  setTab(value);
                  setCursor(null);
                  setPayload(null);
                  setCall("");
                }}
              >
                <Tabs.List
                  aria-label={t("conversationView.conversationDetail")}
                >
                  {["Timeline", "Tools", "Usage", "Model", "Content"].map(
                    (item) => (
                      <Tabs.Trigger key={item} value={item}>
                        {copy(item)}
                      </Tabs.Trigger>
                    ),
                  )}
                </Tabs.List>
                <Tabs.Content value="Usage" className="dc-stack mt-4">
                  <section
                    className="dc-stat-grid"
                    data-columns="4"
                    aria-label={t("conversationView.conversationSummary")}
                  >
                    {[
                      [
                        t("conversationView.reportedTokens"),
                        number(usage.totalTokens, numberLocale),
                        t(
                          "conversationView.onlyAttemptsWithKnownInputAndOutputCacheAnd",
                        ),
                      ],
                      [
                        t("conversationView.toolCalls"),
                        number(counts.tools, numberLocale),
                        t(
                          "conversationView.eachCallCountedOnceEvenAcrossMultipleEventsExcludes",
                        ),
                      ],
                      [
                        t("conversationView.dispatchedModelAttempts"),
                        number(counts.dispatched, numberLocale),
                        t(
                          "conversationView.observedDispatchesRetriesAndCompactionsAreDistinctAttempts",
                        ),
                      ],
                      [
                        t("conversationView.turnDuration"),
                        picked?.state === "running"
                          ? t("conversationView.running")
                          : picked?.durationMs != null
                            ? `${number(picked.durationMs, numberLocale)} ms`
                            : t("conversationView.unknown"),
                        turn
                          ? t(
                              "conversationView.instrumentedStartToTerminalNotASumOfAttempts",
                            )
                          : t("conversationView.selectATurnToInspectDuration"),
                      ],
                    ].map(([label, value, help], statIndex) => (
                      <article
                        key={
                          ["tokens", "tools", "dispatches", "duration"][
                            statIndex
                          ]
                        }
                        className="dc-stat"
                      >
                        <h2>{label}</h2>
                        <p className="dc-stat-value">{value}</p>
                        <p>{help}</p>
                      </article>
                    ))}
                  </section>
                  <p className="text-sm text-muted-foreground">
                    {t("conversationView.input")}
                    {number(usage.inputTokens, numberLocale)}{" "}
                    {t("conversationView.output")}{" "}
                    {number(usage.outputTokens, numberLocale)} ·{" "}
                    {Number(counts.missing ?? 0) > 0
                      ? `${number(counts.missing, numberLocale)} ${Number(counts.missing) === 1 ? "attempt" : "attempts"} without complete reported usage.`
                      : t(
                          "conversationView.usageDependsOnFieldsActuallyReported",
                        )}
                  </p>
                  <dl className="dc-usage-subsets">
                    {[
                      [
                        t("conversationView.input2"),
                        "input",
                        usage.inputTokens,
                      ],
                      [
                        t("conversationView.output2"),
                        "output",
                        usage.outputTokens,
                      ],
                      [
                        t("conversationView.cacheInputSubset"),
                        "cache",
                        usage.cachedInputTokens,
                      ],
                      [
                        t("conversationView.reportedReasoningSubsetNoContent"),
                        "reasoning",
                        usage.reasoningTokens,
                      ],
                    ].map(([label, field, value]) => (
                      <div key={String(field)}>
                        <dt>{String(label)}</dt>
                        <dd>
                          {number(value, numberLocale)}{" "}
                          {t("conversationView.reportedIn")}{" "}
                          {number(
                            obj(obj(usage.coverage)[String(field)]).reported,
                            numberLocale,
                          )}{" "}
                          {t("commonFragments.of")}{" "}
                          {number(
                            obj(obj(usage.coverage)[String(field)]).observed,
                            numberLocale,
                          )}{" "}
                          {t("conversationView.retainedAttempts")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    {t("conversationView.tools2")}
                    {number(counts.toolRequested, numberLocale)}{" "}
                    {t("conversationView.requested")}{" "}
                    {number(counts.toolExecuted, numberLocale)}{" "}
                    {t("conversationView.withResult")}{" "}
                    {number(counts.toolFailed, numberLocale)}{" "}
                    {t("conversationView.failed")}{" "}
                    {number(counts.toolRejected, numberLocale)}{" "}
                    {t("conversationView.rejected")}{" "}
                    {number(counts.toolCancelled, numberLocale)}{" "}
                    {t("conversationView.cancelled")}{" "}
                    {number(counts.toolPending, numberLocale)}{" "}
                    {t(
                      "conversationView.pendingInCaptureMissingEventsDoNotProveNon",
                    )}
                  </p>
                  <section className="dc-card">
                    <h2>{t("conversationView.reportedUsageByTurn")}</h2>
                    <p className="dc-meta mt-1">
                      {t(
                        "conversationView.upTo50TurnsPerPageSessionTotalsCover",
                      )}
                    </p>
                    <UsagePerTurnRows
                      turns={turns.map((r, i) => ({
                        id: String(r.turnId),
                        label: t("presentation.turn", { count: i + 1 }),
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
                    <div className="mt-4">
                      <Table
                        aria-label={t(
                          "conversationView.turnDurationAndCoverage",
                        )}
                      >
                        <thead>
                          <tr>
                            <th scope="col">{t("conversationView.turn")}</th>
                            <th scope="col" className="numeric">
                              {t("conversationView.input2")}
                            </th>
                            <th scope="col" className="numeric">
                              {t("conversationView.output2")}
                            </th>
                            <th scope="col">
                              {t("conversationView.duration")}
                            </th>
                            <th scope="col">
                              {t("conversationView.coverage")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {turns.map((r, i) => (
                            <tr key={String(r.turnId)}>
                              <td>
                                <Button
                                  size="sm"
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
                                  {t("conversationView.turn")}
                                  {i + 1}
                                </Button>
                              </td>
                              <td className="numeric">
                                {number(r.inputTokens, numberLocale)}
                              </td>
                              <td className="numeric">
                                {number(r.outputTokens, numberLocale)}
                              </td>
                              <td>
                                {r.state === "running"
                                  ? t("conversationView.running")
                                  : r.durationMs != null
                                    ? `${number(r.durationMs, numberLocale)} ms`
                                    : t("conversationView.noMeasurement")}
                              </td>
                              <td className="dc-meta">
                                {number(
                                  obj(obj(r.coverage).total).reported,
                                  numberLocale,
                                )}{" "}
                                {t("commonFragments.of")}{" "}
                                {number(r.attempts, numberLocale)}{" "}
                                {t(
                                  "conversationView.attemptsWithCompleteUsage",
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                    {!turns.length ? (
                      <p className="dc-meta py-4">
                        {t(
                          "conversationView.noRetainedInstrumentedTurnsToPlot",
                        )}
                      </p>
                    ) : null}
                  </section>
                  <p className="text-xs text-muted-foreground">
                    {number(s.totalTurns, numberLocale)}{" "}
                    {t(
                      "conversationView.turnsWithRetainedEvidenceUpTo50PerPage",
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {typeof s.nextTurnCursor === "string" ? (
                      <Button
                        variant="outline"
                        onClick={() => setTurnCursor(String(s.nextTurnCursor))}
                      >
                        {t("conversationView.nextTurnPage")}
                      </Button>
                    ) : null}
                    {turnCursor ? (
                      <Button
                        variant="ghost"
                        onClick={() => setTurnCursor(null)}
                      >
                        {t("conversationView.firstTurnPage")}
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
                        className="dc-card dc-event-card"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h2 className="text-sm font-medium">
                              {copy(titles[String(e.kind)]) ?? "Recorded event"}
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {copy(states[String(e.status)]) ??
                                "State not confirmed"}
                              {e.tool
                                ? ` · ${obj(e.toolIdentity).family === "discovery" ? t("conversationView.toolDiscovery") : dashboardToolName.safeParse(obj(e.toolIdentity).canonicalName).success ? copy(toolCopy[dashboardToolName.parse(obj(e.toolIdentity).canonicalName)].title) : t("conversationView.registeredTool")}`
                                : ""}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            <Instant value={e.occurredAt} />
                          </span>
                        </div>
                        {e.durationMs != null ? (
                          <p className="mt-2 text-sm tabular-nums">
                            {t("conversationView.recordedDuration")}
                            {number(e.durationMs, numberLocale)} ms
                          </p>
                        ) : null}
                        {e.kind && String(e.kind).startsWith("attempt_") ? (
                          <p className="mt-2 text-sm">
                            {t("conversationView.reportedTokens2")}
                            {number(e.inputTokens, numberLocale)}{" "}
                            {t("conversationView.input3")}{" "}
                            {number(e.outputTokens, numberLocale)}{" "}
                            {t(
                              "conversationView.outputCannotInferWhichEvidenceInfluencedTheResponse",
                            )}
                          </p>
                        ) : null}
                        <p className="mt-2 text-xs text-muted-foreground">
                          {e.captureStatus === "captured"
                            ? t("conversationView.capturedSanitizedContent")
                            : e.captureStatus === "partial"
                              ? t(
                                  "conversationView.partialCaptureContentMayBeMissing",
                                )
                              : t(
                                  "conversationView.contentNotRecordedOrOmittedUncapturedContentCannotBe",
                                )}
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
                                {t(
                                  "conversationView.inspectToolResultSentToModel",
                                )}
                                {i + 1}
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
                                      warning: t(
                                        "conversationView.contentExpiredOrUnavailable",
                                      ),
                                    });
                                }
                              }}
                            >
                              {t("conversationView.openSanitizedContent")}
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
                <Empty title={t("conversationView.noCapturedConversationsYet")}>
                  <p>
                    {t(
                      "conversationView.openChatToStartAConversationOnlyYourSessions",
                    )}
                  </p>
                  <Button asChild>
                    <Link href="/s">{t("conversationView.openChat")}</Link>
                  </Button>
                </Empty>
              ) : null}
              {entries.length ? (
                <div className="dc-card dc-session-list">
                  {entries.map((e, i) => (
                    <article
                      key={String(e.sessionId)}
                      className="dc-session-row"
                    >
                      <div className="dc-session-main">
                        <span className="dc-session-icon" aria-hidden="true">
                          <MessageSquare />
                        </span>
                        <div>
                          <h2>
                            {t("conversationView.conversation")} {i + 1}
                          </h2>
                          <p className="dc-meta">
                            {t("conversationView.created")}{" "}
                            <Instant value={e.createdAt} /> ·{" "}
                            {e.captureStatus === "not_instrumented"
                              ? t("conversationView.notInstrumented")
                              : t("conversationView.bestEffortCapture")}
                          </p>
                        </div>
                      </div>
                      <div className="dc-session-actions">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/s/${e.sessionId}`}>
                            {t("conversationView.openChat")}
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link
                            href={`/dashboard/conversations/${e.sessionId}`}
                          >
                            {t("conversationView.inspectConversation")}
                          </Link>
                        </Button>
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
          {t("activityView.nextPage")}
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
            {t("conversationView.closeContent")}
          </Button>
        </div>
      ) : null}
    </>
  );
}
