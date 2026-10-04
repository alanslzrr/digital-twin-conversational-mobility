"use client";
import type { DashboardEntity } from "@mobility/contracts";
import Link from "next/link";
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
  const forecast = e.kind === "forecast",
    reference = e.kind === "catalog";
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b p-5">
        <h2 className="text-lg font-semibold">{e.name}</h2>
        <p className="mt-2 text-sm">
          {productLabel(e.evidence.productId)} · {states[e.evidence.freshness]}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {evidenceExplanation(e.evidence.reason, e.evidence.coverage)}
        </p>
      </div>
      <dl className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {e.measurements.map((m) => (
          <div key={m.name}>
            <dt className="text-sm text-muted-foreground">
              {publicLabel(m.name)}
            </dt>
            <dd className="mt-1 text-lg font-medium tabular-nums">
              {measurementDisplay(m.name, m.value, m.unit)}
            </dd>
            {m.basis ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {m.basis === "interval"
                  ? `Accumulated or aggregated over ${m.periodMinutes ?? "the published period"}${m.periodMinutes != null ? "  minutes" : ""}`
                  : "Instant value"}
              </p>
            ) : null}
          </div>
        ))}
      </dl>
      <div className="grid gap-4 border-t p-5 text-sm sm:grid-cols-2">
        <p>
          {forecast ? "Forecast issuance" : "Published observation"}:{" "}
          {forecast && !e.evidence.issuedAt ? (
            (e.evidence.issuedAtRaw ?? "Time unknown")
          ) : (
            <Instant
              value={forecast ? e.evidence.issuedAt : e.evidence.observedAt}
            />
          )}
        </p>
        <p>
          Storage ingestion: <Instant value={e.evidence.ingestedAt} />. Does not
          renew the observation.
        </p>
        {e.evidence.checkedAt ? (
          <p>
            Last source check: <Instant value={e.evidence.checkedAt} />. Not a
            new publication.
          </p>
        ) : null}
        {e.evidence.validFrom || e.evidence.validTo ? (
          <p>
            {forecast ? "Forecast interval" : "Published validity"}:{" "}
            <Instant value={e.evidence.validFrom} /> —{" "}
            <Instant value={e.evidence.validTo} />.
          </p>
        ) : null}
        {reference ? (
          <p>Reference catalog, not live availability or arrivals.</p>
        ) : null}
        <p>
          {e.latitude === null || e.longitude === null
            ? "No published coordinates; no fabricated map point."
            : "Published coordinates do not certify measurement coverage."}
        </p>
        <p>
          Declared quality:{" "}
          {e.evidence.quality === "validated"
            ? "Validated"
            : e.evidence.quality === "provisional"
              ? "Provisional"
              : "Unknown"}
          .
        </p>
        <Link
          href={`/dashboard/sources/${e.evidence.sourceId}`}
          className="inline-flex min-h-11 items-center underline"
        >
          Inspect source and refresh evidence
        </Link>
      </div>
    </section>
  );
}
