"use client";
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
      <h2 className="text-base font-semibold">Query result</h2>
      <p className="text-sm">
        {availability === "not_materialized"
          ? "This result requires explicit execution, not stored inspection."
          : envelope.truncated
            ? "Result truncated by size limit. Narrow filters; omitted content unavailable."
            : availability === "partial"
              ? "Partial selection coverage, not complete or live availability."
              : availability === "unavailable"
                ? "No usable stored result for this selection."
                : availability === "running"
                  ? "Execution running. Recover status without re-execution."
                  : availability === "outcome_unknown"
                    ? "Execution outcome unknown. Recover by ID without re-execution."
                    : "Query finished. Evidence retains its own time and coverage."}
      </p>
      <p className="text-xs text-muted-foreground">
        Query evaluated:{" "}
        <Instant value={envelope.evaluatedAt ?? envelope.completedAt} /> ·{" "}
        {envelope.executionMode === "captured_transport"
          ? "Content capturado del transporte; abrirlo no ejecuta herramientas."
          : envelope.executionMode === "stored_only"
            ? "Stored only; no provider acquisition."
            : "Explicit manual execution."}
      </p>
      {typeof root.status === "string" && statusCopy[root.status] ? (
        <p className="text-sm">{statusCopy[root.status]}</p>
      ) : null}
      {typeof root.reason === "string" && statusCopy[root.reason] ? (
        <p className="text-sm">{statusCopy[root.reason]}</p>
      ) : null}
      {provenance.observedAt ? (
        <p className="text-sm">
          Published observation: <Instant value={provenance.observedAt} />.
          Incorporada: <Instant value={provenance.ingestedAt} />.
        </p>
      ) : null}
      {typeof root.warning === "string" ? (
        <p className="text-sm leading-6">
          This result has coverage and validity limits. Check source evidence
          and times; not a service or availability guarantee.
        </p>
      ) : null}
      {collections.map(({ key, rows }) => (
        <section key={key}>
          <h3 className="text-sm font-medium">
            {publicLabel(key)} · {number(rows.length)} returned records, not
            global coverage
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
                        (r.kind ? publicLabel(String(r.kind)) : null) ??
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
                    Observed:{" "}
                    <Instant
                      value={r.observedAt ?? obj(r.provenance).observedAt}
                    />{" "}
                    · Ingested:{" "}
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
                            {publicLabel(key)}
                          </dt>
                          <dd className="tabular-nums">
                            {typeof r[key] === "number"
                              ? number(r[key])
                              : String(r[key])}
                            {key === "value" && r.unit
                              ? ` ${r.unit}`
                              : key === "vehiclesPerHour"
                                ? " vehicles/h"
                                : key === "occupancyPercent"
                                  ? " %"
                                  : ""}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  {array(r.measurements).map((m) => (
                    <p key={String(m.name)}>
                      {publicLabel(String(m.name))}: {number(m.value)}{" "}
                      {String(m.unit ?? "")} ·{" "}
                      {m.basis === "interval"
                        ? `Agregada o acumulada durante ${m.periodMinutes ?? "its interval"}  minutes`
                        : "Snapshot"}
                    </p>
                  ))}
                  {r.validFrom || r.validTo ? (
                    <p>
                      Published period: <Instant value={r.validFrom} /> —{" "}
                      <Instant value={r.validTo} />.{" "}
                      {r.basis === "interval"
                        ? "Accumulated value o agregado durante este periodo."
                        : r.basis === "instant"
                          ? "Instant value."
                          : ""}
                    </p>
                  ) : null}
                  {array(r.streams).map((stream) => (
                    <p key={String(stream.id)}>
                      {productLabel(String(stream.id))}:{" "}
                      {number(
                        stream.count ??
                          obj(stream.summary).count ??
                          obj(stream.summary).total,
                      )}{" "}
                      collection records; not individual freshness evidence.
                      {statusCopy[String(stream.status)] ??
                        "State not confirmed."}{" "}
                      Collection observation:{" "}
                      <Instant
                        value={
                          stream.observedAt ?? obj(stream.provenance).observedAt
                        }
                      />{" "}
                      · Ingestion:{" "}
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
                      Category {String(a.name ?? a.category)}:{" "}
                      {number(a.freeSpaces)} free spaces ·{" "}
                      <Instant value={a.observedAt} />
                    </p>
                  ))}
                  {r.startsAt || r.endsAt ? (
                    <p>
                      Validity: <Instant value={r.startsAt} /> —{" "}
                      <Instant value={r.endsAt} />
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Empty stored collection for this selection, not absence of
              incidents or citywide availability.
            </p>
          )}
        </section>
      ))}
      {!collections.length && availability !== "not_materialized" ? (
        <p className="text-sm text-muted-foreground">
          No reading collection in this result. Tool limitations describe its
          scope; inspect sanitized metadata below.
        </p>
      ) : null}
      <Technical value={value} />
    </section>
  );
}
