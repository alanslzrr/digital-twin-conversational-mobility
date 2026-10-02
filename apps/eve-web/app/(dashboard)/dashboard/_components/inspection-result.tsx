"use client";
import { number } from "./insights";
import { productLabel } from "./product-copy";
import { Instant, publicLabel, Technical } from "./shared";

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
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
      <h2 className="text-base font-semibold">Resultado de la consulta</h2>
      <p className="text-sm">
        {availability === "not_materialized"
          ? "Este resultado necesita una ejecución explícita; no se calcula al consultar almacenado."
          : envelope.truncated
            ? "Resultado incompleto por el límite de tamaño. Reduce los filtros; el contenido omitido no está disponible."
            : availability === "partial"
              ? "Cobertura parcial para esta selección. No equivale a información completa ni a disponibilidad en directo."
              : availability === "unavailable"
                ? "Sin resultado guardado utilizable para esta selección."
                : availability === "running"
                  ? "Ejecución en curso. Recupera su estado sin volver a ejecutarla."
                  : availability === "outcome_unknown"
                    ? "No se conoce el resultado de la ejecución. No vuelvas a ejecutarla para recuperarlo."
                    : "Consulta terminada. Cada dato conserva su propia fecha y cobertura."}
      </p>
      <p className="text-xs text-muted-foreground">
        Consulta evaluada:{" "}
        <Instant value={envelope.evaluatedAt ?? envelope.completedAt} /> ·{" "}
        {envelope.executionMode === "captured_transport"
          ? "Contenido capturado del transporte; abrirlo no ejecuta herramientas."
          : envelope.executionMode === "stored_only"
            ? "Solo almacenamiento; sin adquisición a fuentes."
            : "Ejecución manual explícita."}
      </p>
      {provenance.observedAt ? (
        <p className="text-sm">
          Observación publicada: <Instant value={provenance.observedAt} />.
          Incorporada: <Instant value={provenance.ingestedAt} />.
        </p>
      ) : null}
      {typeof root.warning === "string" ? (
        <p className="text-sm leading-6">
          Este resultado tiene limitaciones de cobertura y vigencia. Comprueba
          las fechas y consulta la procedencia; no es una garantía de servicio o
          disponibilidad.
        </p>
      ) : null}
      {collections.map(({ key, rows }) => (
        <section key={key}>
          <h3 className="text-sm font-medium">
            {publicLabel(key)} · {number(rows.length)} registros devueltos, no
            cobertura total
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
                          ? `Información de ${r.source.toUpperCase()}`
                          : null) ??
                        r.job ??
                        (r.kind ? publicLabel(String(r.kind)) : null) ??
                        `Registro ${i + 1}`,
                    )}
                  </h4>
                  {typeof r.description === "string" ? (
                    <p className="leading-6 text-muted-foreground">
                      {r.description}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Observado:{" "}
                    <Instant
                      value={r.observedAt ?? obj(r.provenance).observedAt}
                    />{" "}
                    · Incorporado:{" "}
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
                                ? " vehículos/h"
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
                        ? `Agregada o acumulada durante ${m.periodMinutes ?? "su periodo"} minutos`
                        : "Instantánea"}
                    </p>
                  ))}
                  {r.validFrom || r.validTo ? (
                    <p>
                      Periodo publicado: <Instant value={r.validFrom} /> —{" "}
                      <Instant value={r.validTo} />.{" "}
                      {r.basis === "interval"
                        ? "Valor acumulado o agregado durante este periodo."
                        : r.basis === "instant"
                          ? "Valor instantáneo."
                          : ""}
                    </p>
                  ) : null}
                  {array(r.streams).map((stream) => (
                    <p key={String(stream.id)}>
                      {productLabel(String(stream.id))}: {number(stream.count)}{" "}
                      registros de colección; no certifican frescura individual.
                      Observación de colección:{" "}
                      <Instant value={stream.observedAt} /> · Incorporación:{" "}
                      <Instant value={stream.ingestedAt} />.
                    </p>
                  ))}
                  {array(r.availability).map((a) => (
                    <p key={String(a.category)}>
                      Categoría {String(a.name ?? a.category)}:{" "}
                      {number(a.freeSpaces)} plazas libres ·{" "}
                      <Instant value={a.observedAt} />
                    </p>
                  ))}
                  {r.startsAt || r.endsAt ? (
                    <p>
                      Vigencia: <Instant value={r.startsAt} /> —{" "}
                      <Instant value={r.endsAt} />
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Colección guardada vacía para esta selección. No demuestra
              ausencia de incidencias o disponibilidad en toda la ciudad.
            </p>
          )}
        </section>
      ))}
      {!collections.length && availability !== "not_materialized" ? (
        <p className="text-sm text-muted-foreground">
          No hay una colección de lecturas en este resultado. Su alcance se
          describe en las limitaciones de la herramienta; los metadatos saneados
          se pueden inspeccionar debajo.
        </p>
      ) : null}
      <Technical value={value} />
    </section>
  );
}
