"use client";
import { useUi } from "@/i18n/provider";

import { number } from "./insights";
import { productLabel } from "./product-copy";
import { Instant, publicLabel, Technical } from "./shared";

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const statusCopy: Record<string, string> = {
  partial_coverage:
    "Stored evidence covers part of the selection, not normal operation.",
  partial_or_unavailable: "Partial or unavailable evidence for this component.",
  not_initialized: "No stored reading for this product yet.",
  available: "Stored evidence exists; check how recent it is.",
  unavailable: "No usable reading for this selection.",
  stale: "Old reading; it keeps its original time.",
  fresh: "Recent by policy, not an availability guarantee.",
  unknown: "State not confirmed by the available evidence.",
  outside_24h_retention:
    "Requested instant outside the retained 24-hour history.",
  no_retained_observation_at_instant:
    "No retained observations for that instant.",
  not_materialized:
    "Requires explicit execution; not calculated by stored reads.",
};
const array = (v: unknown) => (Array.isArray(v) ? v.map(obj) : []);
export function InspectionResult({ value }: { value: unknown }) {
  const { t, copy, numberLocale } = useUi();

  const envelope = obj(value),
    data = obj(envelope.result),
    provenance = obj(data.provenance),
    root = Object.keys(data).length ? data : envelope;
  const collections = [
    "stations",
    "parkings",
    "sensors",
    "readings",
    "incidents",
    "places",
    "arrivals",
    "departures",
    "observations",
    "sources",
    "products",
    "itineraries",
    "components",
    "periods",
    "alerts",
    "declarations",
    "identities",
  ]
    .map((key) => ({
      key,
      rows: array(root[key]).map((r) => ({
        ...r,
        ...(r.value && typeof r.value === "object" ? obj(r.value) : {}),
      })),
    }))
    .filter((c) => Array.isArray(root[c.key]));
  const availability = envelope.availability ?? envelope.state ?? root.status;
  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      <h2 className="text-base font-medium">
        {t("inspectionResult.queryResult")}
      </h2>
      <p className="text-sm">
        {availability === "not_materialized"
          ? t(
              "inspectionResult.thisResultRequiresExplicitExecutionNotStoredInspection",
            )
          : envelope.truncated
            ? t(
                "inspectionResult.resultTruncatedBySizeLimitNarrowFiltersOmittedContent",
              )
            : availability === "partial"
              ? t(
                  "inspectionResult.partialSelectionCoverageNotCompleteOrLiveAvailability",
                )
              : availability === "unavailable"
                ? t("inspectionResult.noUsableStoredResultForThisSelection")
                : availability === "running"
                  ? t(
                      "inspectionResult.executionRunningRecoverStatusWithoutReExecution",
                    )
                  : availability === "outcome_unknown"
                    ? t(
                        "inspectionResult.executionOutcomeUnknownRecoverByIdWithoutReExecution",
                      )
                    : t(
                        "inspectionResult.queryFinishedEvidenceRetainsItsOwnTimeAndCoverage",
                      )}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("inspectionResult.queryEvaluated")}{" "}
        <Instant value={envelope.evaluatedAt ?? envelope.completedAt} /> ·{" "}
        {envelope.executionMode === "captured_transport"
          ? t(
              "inspectionResult.contentCapturadoDelTransporteAbrirloNoEjecutaHerramientas",
            )
          : envelope.executionMode === "stored_only"
            ? t("inspectionResult.storedOnlyNoProviderAcquisition")
            : t("inspectionResult.explicitManualExecution")}
      </p>
      {typeof root.status === "string" && statusCopy[root.status] ? (
        <p className="text-sm">{statusCopy[root.status]}</p>
      ) : null}
      {typeof root.reason === "string" && statusCopy[root.reason] ? (
        <p className="text-sm">{statusCopy[root.reason]}</p>
      ) : null}
      {provenance.observedAt ? (
        <p className="text-sm">
          {t("inspectionResult.publishedObservation")}
          <Instant value={provenance.observedAt} />. Incorporada:{" "}
          <Instant value={provenance.ingestedAt} />.
        </p>
      ) : null}
      {typeof root.warning === "string" ? (
        <p className="text-sm leading-6">
          {t(
            "inspectionResult.thisResultHasCoverageAndValidityLimitsCheckSource",
          )}
        </p>
      ) : null}
      {collections.map(({ key, rows }) => (
        <section key={key}>
          <h3 className="text-sm font-medium">
            {copy(publicLabel(key))} · {number(rows.length, numberLocale)}{" "}
            {t("inspectionResult.returnedRecordsNotGlobalCoverage")}
          </h3>
          {rows.length ? (
            <div className="mt-3 divide-y">
              {rows.map((r, i) => (
                <article
                  key={String(r.id ?? r.stationId ?? r.job ?? i)}
                  className="flex flex-col gap-2 py-3 text-sm"
                >
                  <h4 className="font-medium">
                    {String(
                      r.name ??
                        r.title ??
                        r.destination ??
                        r.label ??
                        (typeof r.source === "string"
                          ? `Information de ${r.source.toUpperCase()}`
                          : null) ??
                        r.job ??
                        (r.kind ? copy(publicLabel(String(r.kind))) : null) ??
                        `Registro ${i + 1}`,
                    )}
                  </h4>
                  {typeof r.status === "string" && statusCopy[r.status] ? (
                    <p>{statusCopy[r.status]}</p>
                  ) : null}
                  {typeof r.description === "string" ? (
                    <p className="leading-6 text-muted-foreground">
                      {r.description}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {t("inspectionResult.observed")}{" "}
                    <Instant
                      value={r.observedAt ?? obj(r.provenance).observedAt}
                    />{" "}
                    {t("inspectionResult.ingested")}{" "}
                    <Instant
                      value={obj(r.provenance).ingestedAt ?? r.ingestedAt}
                    />
                  </p>
                  <dl className="flex flex-wrap gap-x-6 gap-y-2">
                    {[
                      "bikes",
                      "docks",
                      "freeSpaces",
                      "vehiclesPerHour",
                      "occupancyPercent",
                      "value",
                      "line",
                      "destination",
                      "estimateSecondsAtObservation",
                      "amount",
                      "temperature",
                      "windSpeedKmh",
                      "humidityPercent",
                      "count",
                    ]
                      .filter((key) => r[key] != null)
                      .map((key) => (
                        <div key={key}>
                          <dt className="text-xs text-muted-foreground">
                            {copy(publicLabel(key))}
                          </dt>
                          <dd className="tabular-nums">
                            {typeof r[key] === "number"
                              ? number(r[key], numberLocale)
                              : String(r[key])}
                            {key === "value" && r.unit
                              ? ` ${r.unit}`
                              : key === "vehiclesPerHour"
                                ? t("inspectionResult.vehiclesH")
                                : key === "occupancyPercent"
                                  ? " %"
                                  : ""}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  {array(r.measurements).map((m) => (
                    <p key={String(m.name)}>
                      {copy(publicLabel(String(m.name)))}:{" "}
                      {number(m.value, numberLocale)} {String(m.unit ?? "")} ·{" "}
                      {m.basis === "interval"
                        ? t("presentation.intervalBasis", {
                            minutes:
                              typeof m.periodMinutes === "number"
                                ? m.periodMinutes
                                : t("conversationView.unknown"),
                          })
                        : t("inspectionResult.snapshot")}
                    </p>
                  ))}
                  {r.validFrom || r.validTo ? (
                    <p>
                      {t("inspectionResult.publishedPeriod")}
                      <Instant value={r.validFrom} /> —{" "}
                      <Instant value={r.validTo} />.{" "}
                      {r.basis === "interval"
                        ? t(
                            "inspectionResult.accumulatedValueOAgregadoDuranteEstePeriodo",
                          )
                        : r.basis === "instant"
                          ? t("inspectionResult.instantValue")
                          : ""}
                    </p>
                  ) : null}
                  {array(r.streams).map((stream) => (
                    <p key={String(stream.id)}>
                      {copy(productLabel(String(stream.id)))}:{" "}
                      {number(
                        stream.count ??
                          obj(stream.summary).count ??
                          obj(stream.summary).total,
                        numberLocale,
                      )}{" "}
                      {t(
                        "inspectionResult.collectionRecordsNotIndividualFreshnessEvidence",
                      )}
                      {statusCopy[String(stream.status)] ??
                        "State not confirmed."}{" "}
                      {t("inspectionResult.collectionObservation")}{" "}
                      <Instant
                        value={
                          stream.observedAt ?? obj(stream.provenance).observedAt
                        }
                      />{" "}
                      {t("inspectionResult.ingestion")}{" "}
                      <Instant
                        value={
                          stream.ingestedAt ?? obj(stream.provenance).ingestedAt
                        }
                      />
                      .
                    </p>
                  ))}
                  {array(r.availability).map((a) => (
                    <p key={String(a.category)}>
                      {t("inspectionResult.category")}
                      {String(a.name ?? a.category)}:{" "}
                      {number(a.freeSpaces, numberLocale)}{" "}
                      {t("inspectionResult.freeSpaces")}{" "}
                      <Instant value={a.observedAt} />
                    </p>
                  ))}
                  {r.startsAt || r.endsAt ? (
                    <p>
                      {t("inspectionResult.validity")}
                      <Instant value={r.startsAt} /> —{" "}
                      <Instant value={r.endsAt} />
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "inspectionResult.emptyStoredCollectionForThisSelectionNotAbsenceOf",
              )}
            </p>
          )}
        </section>
      ))}
      {!collections.length && availability !== "not_materialized" ? (
        <p className="text-sm text-muted-foreground">
          {t(
            "inspectionResult.noReadingCollectionInThisResultToolLimitationsDescribe",
          )}
        </p>
      ) : null}
      <Technical value={value} />
    </section>
  );
}
