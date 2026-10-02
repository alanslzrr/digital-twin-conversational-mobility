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
  recent: "Lectura reciente",
  recently_checked: "Predicción comprobada",
  stale: "Dato antiguo",
  unavailable: "Sin lectura utilizable",
  unknown: "Antigüedad no confirmada",
  static: "Referencia publicada",
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
                  ? `Acumulada o agregada durante ${m.periodMinutes ?? "el periodo publicado"}${m.periodMinutes != null ? " minutos" : ""}`
                  : "Valor instantáneo"}
              </p>
            ) : null}
          </div>
        ))}
      </dl>
      <div className="grid gap-4 border-t p-5 text-sm sm:grid-cols-2">
        <p>
          {forecast ? "Publicación de la predicción" : "Observación publicada"}:{" "}
          {forecast && !e.evidence.issuedAt ? (
            (e.evidence.issuedAtRaw ?? "Hora no confirmada")
          ) : (
            <Instant
              value={forecast ? e.evidence.issuedAt : e.evidence.observedAt}
            />
          )}
        </p>
        <p>
          Incorporación al almacenamiento:{" "}
          <Instant value={e.evidence.ingestedAt} />. No rejuvenece la
          observación.
        </p>
        {e.evidence.checkedAt ? (
          <p>
            Última comprobación de la fuente:{" "}
            <Instant value={e.evidence.checkedAt} />. No equivale a nueva
            publicación.
          </p>
        ) : null}
        {e.evidence.validFrom || e.evidence.validTo ? (
          <p>
            {forecast ? "Predicción para el periodo" : "Vigencia publicada"}:{" "}
            <Instant value={e.evidence.validFrom} /> —{" "}
            <Instant value={e.evidence.validTo} />.
          </p>
        ) : null}
        {reference ? (
          <p>
            Es un catálogo de referencia. No describe disponibilidad ni llegadas
            en directo.
          </p>
        ) : null}
        <p>
          {e.latitude === null || e.longitude === null
            ? "Sin coordenadas publicadas; no se añade un punto ficticio al mapa."
            : "Coordenadas publicadas; una ubicación de referencia no certifica cobertura de una medida."}
        </p>
        <p>
          Calidad declarada:{" "}
          {e.evidence.quality === "validated"
            ? "Validada"
            : e.evidence.quality === "provisional"
              ? "Provisional"
              : "No confirmada"}
          .
        </p>
        <Link
          href={`/dashboard/sources/${e.evidence.sourceId}`}
          className="inline-flex min-h-11 items-center underline"
        >
          Consultar procedencia y actualización
        </Link>
      </div>
    </section>
  );
}
