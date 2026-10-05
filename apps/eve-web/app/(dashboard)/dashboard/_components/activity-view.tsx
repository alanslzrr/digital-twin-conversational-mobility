"use client";

import * as schemas from "@mobility/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useUi } from "@/i18n/provider";
import { useDashboard } from "@/src/dashboard-client";
import { madridCandidates, madridLocal } from "@/src/dashboard-presentation";
import {
  eventComponents,
  eventOutcomes,
  eventTypes,
  outcomeTones,
  severityCopy,
  sourceNames,
} from "./event-copy";
import { ActivityChart, number } from "./insights";
import { Segmented, Sheet } from "./primitives";
import { Instant, PageTitle, publicLabel, State, Technical } from "./shared";

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function unwrap(v: unknown) {
  return obj(v).data;
}
function list(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(obj) : [];
}
export function Events({ id }: { id?: string }) {
  const { t, copy, numberLocale } = useUi();

  const [range, setRange] = useState(() => ({
    to: new Date().toISOString(),
    from: new Date(Date.now() - 86400000).toISOString(),
  }));
  const [severity, setSeverity] = useState(""),
    [source, setSource] = useState(""),
    [eventType, setEventType] = useState(""),
    [customRange, setCustomRange] = useState(false),
    [period, setPeriod] = useState("24h"),
    [outcome, setOutcome] = useState(""),
    [cursor, setCursor] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedSource = schemas.sourceIdSchema.safeParse(
      params.get("source"),
    );
    if (params.get("cursor")) setCursor(params.get("cursor"));
    const from = params.get("from"),
      to = params.get("to");
    if (
      from &&
      to &&
      Number.isFinite(Date.parse(from)) &&
      Number.isFinite(Date.parse(to))
    ) {
      setRange({ from, to });
      setCustomRange(true);
    }
    if (selectedSource.success) setSource(selectedSource.data);
    if (["info", "warning", "error"].includes(params.get("severity") ?? ""))
      setSeverity(params.get("severity") ?? "");
    if (schemas.dashboardEventType.safeParse(params.get("type")).success)
      setEventType(params.get("type") ?? "");
    if (schemas.dashboardWindow.safeParse(params.get("window")).success)
      setPeriod(params.get("window") ?? "24h");
    if (schemas.dashboardEventOutcome.safeParse(params.get("outcome")).success)
      setOutcome(params.get("outcome") ?? "");
  }, []);
  const qs = new URLSearchParams({
    ...(customRange ? range : { window: period }),
    ...(eventType ? { type: eventType } : {}),
    ...(outcome ? { outcome } : {}),
    ...(severity ? { severity } : {}),
    ...(source ? { source } : {}),
    ...(cursor ? { cursor } : {}),
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState({
    source,
    severity,
    eventType,
    outcome,
    from: "",
    to: "",
    fromOffset: "",
    toOffset: "",
  });
  const [rangeError, setRangeError] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<Record<
    string,
    unknown
  > | null>(null);
  const publicSelection = qs.toString();
  useEffect(() => {
    if (!id)
      window.history.replaceState(
        window.history.state,
        "",
        `/dashboard/activity?${publicSelection}`,
      );
  }, [id, publicSelection]);
  const q = useDashboard(
    `${id ? `events/${id}` : "events"}?${qs}`,
    id || cursor || customRange ? 0 : 15000,
    true,
  );
  const value = obj(unwrap(q.data)),
    events = list(value.events);
  const effective = obj(value.range);
  const displayedRange =
    !customRange &&
    typeof effective.from === "string" &&
    typeof effective.to === "string"
      ? { from: effective.from, to: effective.to }
      : range;
  return (
    <>
      <PageTitle
        title={
          id ? t("activityView.activityDetail") : t("activityView.activity")
        }
        description={t(
          "activityView.recordedOperationalEventsMissingCaptureIsNotZeroActivity",
        )}
      />
      {!id ? (
        <div className="dc-toolbar">
          <Segmented
            label={t("activityView.activityPeriod")}
            value={customRange ? "custom" : period}
            onChange={(v) => {
              setPeriod(v);
              setCustomRange(false);
              setCursor(null);
            }}
            options={[
              ["1h", t("commonFragments.hours1hour")],
              ["24h", t("commonFragments.hours24hours")],
              ["7d", t("presentation.days7")],
              ...(customRange
                ? ([["custom", t("activityView.custom")]] as const)
                : []),
            ]}
          />
          <Sheet
            open={filtersOpen}
            onOpenChange={(v) => {
              setFiltersOpen(v);
              if (v) {
                setDraft({
                  source,
                  severity,
                  eventType,
                  outcome,
                  from: madridLocal(displayedRange.from),
                  to: madridLocal(displayedRange.to),
                  fromOffset: "",
                  toOffset: "",
                });
                setRangeError("");
              }
            }}
            title={t("activityView.activityFilters")}
            description={t(
              "activityView.customDatesAreEuropeMadridCivilTimesTransportUses",
            )}
            trigger={
              <Button variant="outline">
                {t("activityView.filters")}
                {source || severity || eventType || outcome
                  ? t("activityView.active")
                  : ""}
              </Button>
            }
          >
            {(
              [
                [
                  "source",
                  t("activityView.source"),
                  schemas.sourceIdSchema.options,
                ],
                [
                  "severity",
                  t("activityView.severity"),
                  ["info", "warning", "error"],
                ],
                [
                  "eventType",
                  t("activityView.eventType"),
                  schemas.dashboardEventType.options,
                ],
                [
                  "outcome",
                  t("activityView.outcome"),
                  schemas.dashboardEventOutcome.options,
                ],
              ] as const
            ).map(([key, label, options]) => (
              <Field key={key}>
                <FieldLabel htmlFor={`event-${key}`}>{label}</FieldLabel>
                <select
                  id={`event-${key}`}
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                >
                  <option value="">{t("activityView.all")}</option>
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {copy(eventTypes[o]) ??
                        copy(eventOutcomes[o]) ??
                        copy(severityCopy[o]) ??
                        o}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
            {(["from", "to"] as const).map((k) => (
              <Field key={k}>
                <FieldLabel htmlFor={`event-${k}`}>
                  {k === "from" ? t("activityView.from") : t("activityView.to")}{" "}
                  (Europe/Madrid)
                </FieldLabel>
                <Input
                  id={`event-${k}`}
                  type="datetime-local"
                  value={draft[k]}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [k]: e.target.value,
                      [`${k}Offset`]: "",
                    })
                  }
                />
                {madridCandidates(draft[k]).length > 1 ? (
                  <Segmented
                    label={t("presentation.utcOffset", {
                      boundary:
                        k === "from"
                          ? t("activityView.from")
                          : t("activityView.to"),
                    })}
                    value={draft[`${k}Offset`]}
                    onChange={(v) => setDraft({ ...draft, [`${k}Offset`]: v })}
                    options={madridCandidates(draft[k]).map((c) => [
                      c.offset,
                      `UTC${c.offset}`,
                    ])}
                  />
                ) : null}
              </Field>
            ))}
            {rangeError ? <p role="alert">{copy(rangeError)}</p> : null}
            <div className="dc-filter-footer">
              <Button
                onClick={() => {
                  const dates = (["from", "to"] as const).map((k) => {
                    const candidates = madridCandidates(draft[k]);
                    return candidates.length === 1
                      ? candidates[0]
                      : candidates.find(
                          (c) => c.offset === draft[`${k}Offset`],
                        );
                  });
                  if (!dates[0] || !dates[1]) {
                    setRangeError(
                      "Invalid or nonexistent local time. For an ambiguous time choose its UTC offset.",
                    );
                    return;
                  }
                  if (
                    Date.parse(dates[0].instant) >= Date.parse(dates[1].instant)
                  ) {
                    setRangeError("From must precede To.");
                    return;
                  }
                  const changed =
                    customRange ||
                    draft.from !== madridLocal(displayedRange.from) ||
                    draft.to !== madridLocal(displayedRange.to);
                  if (changed) {
                    setRange({ from: dates[0].instant, to: dates[1].instant });
                    setCustomRange(true);
                  }
                  setSource(draft.source);
                  setSeverity(draft.severity);
                  setEventType(draft.eventType);
                  setOutcome(draft.outcome);
                  setCursor(null);
                  setFiltersOpen(false);
                }}
              >
                {t("activityView.apply")}
              </Button>
              <Button variant="outline" onClick={() => setFiltersOpen(false)}>
                {t("activityView.cancel")}
              </Button>
            </div>
          </Sheet>
          <span className="dc-meta">
            {t("activityView.europeMadridBestEffortCapture")}
          </span>
        </div>
      ) : (
        <Link href={`/dashboard/activity?${qs}`} className="text-sm underline">
          {t("activityView.backToEvents")}
        </Link>
      )}
      <State
        data={q.data}
        loading={q.isLoading}
        error={q.error}
        empty={!events.length}
      />
      {!id && value.activity ? (
        <ActivityChart
          data={schemas.dashboardActivityChart.parse(value.activity)}
        />
      ) : null}
      <div className="dc-event-region">
        <table className="dc-table">
          <caption className="sr-only">
            {t("activityView.recordedEventsOnThisPageCaptureIsBestEffort")}
          </caption>
          <thead>
            <tr>
              {[
                t("activityView.instant"),
                t("activityView.component"),
                t("activityView.sourceJob"),
                t("activityView.type"),
                t("activityView.outcome"),
              ].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className={
                    h === "Component" || h === "Source / job"
                      ? "dc-secondary-column"
                      : undefined
                  }
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={String(e.id)}>
                <td>
                  <Link
                    href={`/dashboard/activity/${e.id}?${qs}`}
                    onClick={(event) => {
                      if (
                        !id &&
                        event.button === 0 &&
                        !event.metaKey &&
                        !event.ctrlKey &&
                        !event.shiftKey &&
                        !event.altKey
                      ) {
                        event.preventDefault();
                        setSelectedEvent(e);
                      }
                    }}
                    className="dc-event-time inline-flex min-h-8 items-center"
                  >
                    <Instant value={e.occurredAt} />
                  </Link>
                </td>
                <td className="dc-secondary-column">
                  {copy(eventComponents[String(e.component)]) ??
                    "Recorded operation"}
                </td>
                <td className="dc-secondary-column dc-meta">
                  {copy(sourceNames[String(e.source)]) ?? String(e.source)} /{" "}
                  {String(e.job)}
                </td>
                <td>
                  {copy(eventTypes[String(e.type)] ?? "Recorded operation")}
                </td>
                <td>
                  <span
                    className="dc-status"
                    data-tone={outcomeTones[String(e.outcome)] ?? "muted"}
                  >
                    {copy(eventOutcomes[String(e.outcome)] ?? "No outcome")}
                  </span>
                  {e.errorCode ? (
                    <p className="dc-meta">
                      {t("activityView.recordedIssueOpenDetailsForEvidence")}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Sheet
        open={selectedEvent !== null}
        onOpenChange={(v) => {
          if (!v) setSelectedEvent(null);
        }}
        title={t("activityView.recordedEvent")}
        description={t(
          "activityView.retainedOperationalEvidenceCaptureIsBestEffort",
        )}
      >
        {selectedEvent ? (
          <>
            <h2>
              {copy(eventTypes[String(selectedEvent.type)])} ·{" "}
              {copy(eventOutcomes[String(selectedEvent.outcome)])}
            </h2>
            <dl className="dc-evidence">
              {[
                "source",
                "job",
                "occurredAt",
                "recordedAt",
                "expiresAt",
                "durationMs",
                "errorCode",
                "errorStage",
                "operationId",
              ].map((key) => (
                <div key={key}>
                  <dt>
                    {(
                      {
                        job: t("activityView.job"),
                        occurredAt: t("activityView.occurred"),
                        recordedAt: t("activityView.recorded"),
                        operationId: t("activityView.operationId"),
                      } as Record<string, string>
                    )[key] ?? copy(publicLabel(key))}
                  </dt>
                  <dd>
                    {key.endsWith("At") ? (
                      <Instant value={selectedEvent[key]} />
                    ) : selectedEvent[key] == null ? (
                      t("activityView.unavailable")
                    ) : (
                      String(selectedEvent[key])
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <Link
              href={`/dashboard/activity/${selectedEvent.id}?${qs}`}
              className="dc-link"
            >
              {t("activityView.openLinkedEvent")}
            </Link>
            <Technical value={selectedEvent} />
          </>
        ) : null}
      </Sheet>
      {cursor ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t("activityView.historicalPageFixedIntervalNoAutomaticNewEvents")}
          </p>
          <Button variant="outline" onClick={() => setCursor(null)}>
            {t("activityView.returnToFirstPageForCurrentActivity")}
          </Button>
        </>
      ) : null}
      {typeof value.nextCursor === "string" ? (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => setCursor(String(value.nextCursor))}
        >
          {t("activityView.nextPage")}
        </Button>
      ) : null}
      {id ? (
        <>
          <section className="rounded-lg border bg-card p-5">
            <h2 className="font-semibold">{t("activityView.whatHappened")}</h2>
            <p className="mt-2 text-sm">
              {copy(eventTypes[String(events[0]?.type)])} ·{" "}
              {copy(eventOutcomes[String(events[0]?.outcome)])}
            </p>
            <p className="mt-2 text-sm">
              {t("activityView.operationDuration")}
              {number(events[0]?.durationMs, numberLocale)}{" "}
              {t("activityView.msNotProviderHttpLatency")}
            </p>
            <p className="mt-2 text-sm">
              {t("activityView.partialCaptureThisEventDoesNotCertifyAllEntity")}
            </p>
          </section>
          <Technical value={events[0]} />
        </>
      ) : null}
    </>
  );
}
