"use client";

import type { DashboardEntity } from "@mobility/contracts";
import Link from "next/link";
import { useUi } from "@/i18n/provider";
import {
  evidenceExplanation,
  measurementDisplay,
  productLabel,
} from "./product-copy";
import { Instant, publicLabel } from "./shared";

const states: Record<string, string> = {
  recent: "Recent reading",
  recently_checked: "Forecast checked",
  stale: "Stale evidence",
  unavailable: "No usable evidence",
  unknown: "Age unknown",
  static: "Published reference",
};
export function EntityDetail({ entity: e }: { entity: DashboardEntity }) {
  const { t, locale, copy } = useUi();

  const forecast = e.kind === "forecast",
    reference = e.kind === "catalog";
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b p-5">
        <h2 className="text-lg font-semibold">{e.name}</h2>
        <p className="mt-2 text-sm">
          {copy(productLabel(e.evidence.productId))} ·{" "}
          {copy(states[e.evidence.freshness])}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {copy(evidenceExplanation(e.evidence.reason, e.evidence.coverage))}
        </p>
      </div>
      <dl className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {e.measurements.map((m) => (
          <div key={m.name}>
            <dt className="text-sm text-muted-foreground">
              {copy(publicLabel(m.name))}
            </dt>
            <dd className="mt-1 text-lg font-medium tabular-nums">
              {measurementDisplay(m.name, m.value, m.unit, locale)}
            </dd>
            {m.basis ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {m.basis === "interval"
                  ? `Accumulated or aggregated over ${m.periodMinutes ?? "the published period"}${m.periodMinutes != null ? t("entityDetail.minutes") : ""}`
                  : t("entityDetail.instantValue")}
              </p>
            ) : null}
          </div>
        ))}
      </dl>
      <div className="grid gap-4 border-t p-5 text-sm sm:grid-cols-2">
        <p>
          {forecast
            ? t("entityDetail.forecastIssuance")
            : t("entityDetail.publishedObservation")}
          :{" "}
          {forecast && !e.evidence.issuedAt ? (
            (e.evidence.issuedAtRaw ?? "Time unknown")
          ) : (
            <Instant
              value={forecast ? e.evidence.issuedAt : e.evidence.observedAt}
            />
          )}
        </p>
        <p>
          {t("entityDetail.storageIngestion")}
          <Instant value={e.evidence.ingestedAt} />. Does not renew the
          observation.
        </p>
        {e.evidence.checkedAt ? (
          <p>
            {t("entityDetail.lastSourceCheck")}
            <Instant value={e.evidence.checkedAt} />. Not a new publication.
          </p>
        ) : null}
        {e.evidence.validFrom || e.evidence.validTo ? (
          <p>
            {forecast
              ? t("entityDetail.forecastInterval")
              : t("entityDetail.publishedValidity")}
            : <Instant value={e.evidence.validFrom} /> —{" "}
            <Instant value={e.evidence.validTo} />.
          </p>
        ) : null}
        {reference ? (
          <p>
            {t("entityDetail.referenceCatalogNotLiveAvailabilityOrArrivals")}
          </p>
        ) : null}
        <p>
          {e.latitude === null || e.longitude === null
            ? t("entityDetail.noPublishedCoordinatesNoFabricatedMapPoint")
            : t(
                "entityDetail.publishedCoordinatesDoNotCertifyMeasurementCoverage",
              )}
        </p>
        <p>
          {t("entityDetail.declaredQuality")}{" "}
          {e.evidence.quality === "validated"
            ? t("entityDetail.validated")
            : e.evidence.quality === "provisional"
              ? t("entityDetail.provisional")
              : t("conversationView.unknown")}
          .
        </p>
        <Link
          href={`/dashboard/sources/${e.evidence.sourceId}`}
          className="inline-flex min-h-11 items-center underline"
        >
          {t("entityDetail.inspectSourceAndRefreshEvidence")}
        </Link>
      </div>
    </section>
  );
}
