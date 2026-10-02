"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { useDashboard } from "@/src/dashboard-client";
import { eventComponents } from "./event-copy";
import { number } from "./insights";
import { productLabel } from "./product-copy";
import { Instant, PageTitle, State, Technical } from "./shared";

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const list = (v: unknown) => (Array.isArray(v) ? v.map(obj) : []);
const names: Record<string, string> = {
  bicimad: "BiciMAD",
  aemet: "AEMET",
  emt: "Autobuses EMT",
  renfe: "Renfe",
  crtm: "Transporte CRTM",
  dgt: "Carreteras DGT",
  "madrid-air": "Calidad del aire de Madrid",
  "madrid-traffic": "Sensores de tráfico de Madrid",
  "madrid-parking": "Aparcamientos de Madrid",
  osm: "Geografía OpenStreetMap",
};
const operations: Record<string, string> = {
  publication: "Publicación",
  refresh: "Actualización bajo demanda",
  release: "Activación de grafo",
  lease_lost: "Reserva perdida",
  lease_recovered: "Reserva recuperada",
};
function SourcesContent({ id }: { id?: string }) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [window, setWindow] = useState("24h"),
    [operation, setOperation] = useState("");
  const q = useDashboard(
    `${id ? `sources/${encodeURIComponent(id)}` : "sources"}?${new URLSearchParams({ window, ...(cursor ? { cursor } : {}), ...(operation ? { operation } : {}) })}`,
  );
  const status = useDashboard("status", 3000);
  const data = obj(obj(q.data).data),
    sources = list(data.sources),
    metrics = obj(data.metrics);
  const selected = sources[0],
    streams = list(selected?.streams);
  return (
    <>
      <PageTitle
        title={
          id ? (names[id] ?? "Detalle de fuente") : "Fuentes y actualización"
        }
        description="Cómo llega la información y por qué puede no renovarse. Los procesos activos no certifican que el proveedor tenga lecturas recientes."
      />
      <State loading={q.isLoading} error={q.error} />
      {cursor && q.error?.status === 409 ? (
        <Button variant="outline" onClick={() => setCursor(null)}>
          Los recursos cambiaron: volver a la primera página
        </Button>
      ) : null}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">
          Señales de los procesos de actualización
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          No certifican la salud ni la frescura de los proveedores.
        </p>
        <div className="mt-3 flex flex-wrap gap-5 text-sm">
          {list(obj(status.data).workers).map((w) => (
            <p key={String(w.id)}>
              {`Proceso de actualización ${Number(w.id) + 1}`}:{" "}
              {(
                {
                  running: "Señal activa",
                  disabled: "Deshabilitado",
                  not_seen: "Sin señal registrada",
                  stopped_or_unreachable: "Sin señal reciente",
                  inactive_window: "Ventana inactiva",
                } as Record<string, string>
              )[String(w.state)] ?? "Estado no confirmado"}{" "}
              · <Instant value={w.lastSeenAt} />
            </p>
          ))}
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="source-window">
            Periodo de operaciones registradas
          </FieldLabel>
          <select
            id="source-window"
            value={window}
            onChange={(e) => setWindow(e.target.value)}
            className="min-h-11 rounded-md border bg-background px-3 text-sm"
          >
            <option value="1h">Última hora</option>
            <option value="24h">Últimas 24 horas</option>
            <option value="7d">Siete días</option>
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="source-operation">Tipo de operación</FieldLabel>
          <select
            id="source-operation"
            value={operation}
            onChange={(e) => setOperation(e.target.value)}
            className="min-h-11 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Todos, desglosados</option>
            {Object.entries(operations).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <section className="grid divide-y rounded-lg border bg-card sm:grid-cols-2 sm:divide-y-0">
        <article className="p-5 sm:border-r">
          <h2 className="text-sm text-muted-foreground">
            Productos con fallos actuales registrados
          </h2>
          <p className="my-2 text-3xl font-semibold tabular-nums">
            {Array.isArray(metrics.issueProducts)
              ? number(metrics.issueProducts.length)
              : "Sin dato"}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            Productos supervisados: {number(metrics.monitoredProducts)}. Con
            error registrado o falta de señal del proceso durante una ventana
            activa. Ausencia normal de demanda o ventana inactiva no es un
            fallo.
          </p>
        </article>
        <article className="p-5">
          <h2 className="text-sm text-muted-foreground">
            Errores registrados en el periodo
          </h2>
          <p className="my-2 text-3xl font-semibold tabular-nums">
            {number(metrics.errors)}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            Eventos de error únicos retenidos, no una tasa de disponibilidad.{" "}
            <Link
              href={`/dashboard/activity?${new URLSearchParams({ window, ...(id ? { source: id } : {}), severity: "error", ...(operation ? { type: operation } : {}) })}`}
              className="underline"
            >
              Examinar actividad
            </Link>
          </p>
        </article>
      </section>
      {!id ? (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          {(
            [
              [
                "Actualización periódica",
                sources.filter((s) => list(s.streams).length),
              ],
              [
                "Consulta bajo demanda",
                sources.filter((s) =>
                  ["aemet", "emt", "osm"].includes(String(s.id)),
                ),
              ],
              [
                "Catálogos de referencia",
                sources.filter(
                  (s) =>
                    list(s.staticFeed).length || list(s.staticCatalogs).length,
                ),
              ],
            ] as const
          ).map(([label, items]) => (
            <section
              key={label}
              className="overflow-hidden rounded-lg border bg-card"
            >
              <h2 className="p-4 text-base font-semibold">{label}</h2>
              {items.map((s) => (
                <Link
                  key={productLabel(String(s.id))}
                  href={`/dashboard/sources/${s.id}`}
                  className="flex min-h-14 items-center justify-between gap-4 border-t p-4 text-sm hover:bg-accent"
                >
                  <span>{names[String(s.id)] ?? "Fuente publicada"}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.enabled ? "Habilitada" : "Deshabilitada"}
                  </span>
                </Link>
              ))}
              {!items.length ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Sin productos de este grupo registrados.
                </p>
              ) : null}
            </section>
          ))}
        </div>
      ) : (
        <>
          <Link href="/dashboard/sources" className="text-sm underline">
            Todas las fuentes
          </Link>
          <section className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-3">Producto periódico</th>
                  <th className="p-3">Última observación</th>
                  <th className="p-3">Último intento</th>
                  <th className="p-3">Último intento terminado</th>
                  <th className="p-3">Elegible a partir de</th>
                </tr>
              </thead>
              <tbody>
                {streams.map((s) => (
                  <tr key={productLabel(String(s.id))} className="border-t">
                    <td className="p-3">
                      {productLabel(String(s.id))}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {s.errorCode
                          ? "El último intento falló; la lectura anterior se conserva."
                          : s.state === "running"
                            ? "Operación en curso"
                            : "Según frecuencia y ventana de actividad"}
                      </p>
                    </td>
                    {(
                      [
                        "observedAt",
                        "lastAttemptAt",
                        "lastFinishedAt",
                        "nextDueAt",
                      ] as const
                    ).map((field) => (
                      <td key={field} className="p-3 text-xs">
                        <Instant value={s[field]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!streams.length ? (
              <p className="p-4 text-sm">
                Esta fuente no tiene adquisición periódica registrada.
              </p>
            ) : null}
          </section>
          <p className="text-sm leading-6 text-muted-foreground">
            La elegibilidad no promete la hora de una nueva lectura. «Último
            intento terminado» no significa último éxito. No se ofrecen
            reinicios ni reintentos de ingestión desde el panel.
          </p>
          {[
            ["Recursos meteorológicos bajo demanda", list(data.resources)],
            ["Paradas EMT consultadas", list(data.arrivals)],
            [
              "Catálogos de referencia",
              [
                ...list(selected?.staticFeed),
                ...list(selected?.staticCatalogs),
              ],
            ],
          ].map(([label, items]) => (
            <section
              key={String(label)}
              className="rounded-lg border bg-card p-5"
            >
              <h2 className="text-base font-semibold">{String(label)}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Hasta 50 recursos por página; no es el total ni una garantía de
                cobertura territorial.
              </p>
              {(items as Record<string, unknown>[]).length ? (
                <div className="mt-4 flex flex-col divide-y">
                  {(items as Record<string, unknown>[]).map((r) => (
                    <div key={String(r.id)} className="py-3 text-sm">
                      <p className="font-medium">
                        {String(
                          r.label ??
                            (obj(data.resourcePage).kind === "arrivals"
                              ? `Parada EMT ${r.id}`
                              : "Catálogo publicado"),
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Publicado/observado:{" "}
                        <Instant value={r.issuedAt ?? r.observedAt} /> ·
                        Incorporado:{" "}
                        <Instant
                          value={r.importedAt ?? r.fetchedAt ?? r.ingestedAt}
                        />
                      </p>
                      {r.ageBasis ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Fecha usada para evaluar antigüedad diaria:{" "}
                          <Instant value={r.ageBasis} />. No es una hora de
                          publicación verificada.
                        </p>
                      ) : null}
                      {r.checkedAt ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Comprobado: <Instant value={r.checkedAt} />. Vigencia:{" "}
                          <Instant value={r.validFrom} /> —{" "}
                          <Instant value={r.validTo} />.
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs">
                        {r.errorCode
                          ? "Último intento fallido; revisa la actividad y las fechas."
                          : "Conserva la vigencia y las limitaciones publicadas."}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Sin recursos guardados en este grupo. No implica una caída del
                  proveedor.
                </p>
              )}
            </section>
          ))}
        </>
      )}
      {id ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            {number(obj(data.resourcePage).returned)} de{" "}
            {number(obj(data.resourcePage).total)} recursos de{" "}
            {obj(data.resourcePage).kind === "arrivals"
              ? "paradas consultadas"
              : "meteorología"}
            .
          </span>
          {typeof obj(data.resourcePage).nextCursor === "string" ? (
            <Button
              variant="outline"
              onClick={() =>
                setCursor(String(obj(data.resourcePage).nextCursor))
              }
            >
              Siguiente página de recursos
            </Button>
          ) : null}
          {cursor ? (
            <Button variant="ghost" onClick={() => setCursor(null)}>
              Primera página de recursos
            </Button>
          ) : null}
        </div>
      ) : null}
      <section
        // biome-ignore lint/a11y/noNoninteractiveTabindex: enable keyboard scrolling of the horizontal table.
        tabIndex={0}
        aria-label="Latencias por componente y operación"
        className="overflow-x-auto rounded-lg border bg-card p-5"
      >
        <h2 className="text-base font-semibold">
          Duración de operaciones comparables
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Mediana por componente y tipo. No es latencia HTTP del proveedor; p95
          solo con al menos 20 mediciones.
        </p>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-2">Operación / componente</th>
              <th className="p-2">Muestra</th>
              <th className="p-2">Mediana</th>
              <th className="p-2">p95</th>
            </tr>
          </thead>
          <tbody>
            {list(metrics.durations).map((r) => (
              <tr
                key={String(r.component) + String(r.operation)}
                className="border-t"
              >
                <td className="p-2">
                  {operations[String(r.operation)] ?? "Operación registrada"} ·{" "}
                  {eventComponents[String(r.component)] ??
                    "Operación registrada"}
                </td>
                <td className="p-2 tabular-nums">{number(r.n)}</td>
                <td className="p-2 tabular-nums">{number(r.medianMs)} ms</td>
                <td className="p-2 tabular-nums">
                  {r.p95Ms != null
                    ? `${number(r.p95Ms)} ms`
                    : "Muestra insuficiente"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list(metrics.durations).length ? (
          <p className="mt-3 text-sm">
            No hay duraciones medidas para esta selección.
          </p>
        ) : null}
      </section>
      <p className="text-xs text-muted-foreground">
        Captura no exhaustiva · <Instant value={metrics.from} /> —{" "}
        <Instant value={metrics.to} />
      </p>
      <Technical value={data} />
    </>
  );
}

export function Sources({ id }: { id?: string }) {
  return <SourcesContent key={id ?? "all"} {...(id ? { id } : {})} />;
}
