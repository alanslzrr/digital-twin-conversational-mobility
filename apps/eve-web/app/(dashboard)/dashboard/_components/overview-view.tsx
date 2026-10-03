"use client";
import type { DashboardOverview } from "@mobility/contracts";
import Link from "next/link";
import { useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { useDashboard } from "@/src/dashboard-client";
import { eventOutcomes, eventTypes } from "./event-copy";
import { ActivityChart, MetricStrip, number } from "./insights";
import { Instant, PageTitle, State } from "./shared";
export function Overview() {
  const [window, setWindow] = useState("24h");
  const [parkingCategory, setParkingCategory] = useState("");
  const q = useDashboard(
    `overview?${new URLSearchParams({ window, ...(parkingCategory ? { parkingCategory } : {}) })}`,
  );
  const data = q.data as DashboardOverview | undefined;
  return (
    <>
      <PageTitle
        title="Resumen de movilidad"
        description="Datos guardados que puede consultar el asistente. Una lectura reciente no garantiza disponibilidad al llegar."
      />
      <State loading={q.isLoading} error={q.error} />
      {data ? (
        <>
          <Field className="max-w-sm">
            <FieldLabel htmlFor="overview-parking-category">
              Categoría de plazas
            </FieldLabel>
            {data.parkingCategories.length > 1 ? (
              <select
                id="overview-parking-category"
                value={data.parkingCategory ?? ""}
                onChange={(e) => setParkingCategory(e.target.value)}
                className="min-h-11 rounded-md border bg-background px-3 text-sm"
              >
                {data.parkingCategories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label} ({c.code})
                  </option>
                ))}
              </select>
            ) : (
              <p>
                {data.parkingCategories[0]?.label ?? "Sin categoría publicada"}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              La cifra de plazas solo suma esta categoría; no se suman
              categorías diferentes.
            </p>
          </Field>
          <MetricStrip metrics={data.metrics} />
          <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
            <section className="overflow-hidden rounded-lg border bg-card">
              <h2 className="px-5 py-4 text-base font-semibold">
                Qué información puedes consultar
              </h2>
              {(
                [
                  ["departures", "Llegadas y estimaciones"],
                  ["incidents", "Incidencias y avisos"],
                  ["bikes", "Bicicletas BiciMAD"],
                  ["environment", "Aire y meteorología"],
                  ["traffic", "Sensores de tráfico"],
                  ["parking", "Aparcamientos"],
                ] as const
              ).map(([category, label]) => (
                <div key={category} className="border-t px-5 py-4">
                  <Link
                    href={`/dashboard/mobility?section=dynamic&category=${category}`}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {label}
                  </Link>
                  <ul className="mt-2 flex flex-col gap-2 text-sm text-muted-foreground">
                    {data.products
                      .filter((p) => p.category === category)
                      .map((p) => (
                        <li
                          key={p.id}
                          className="flex flex-wrap justify-between gap-2"
                        >
                          <Link
                            href={`/dashboard/mobility?section=dynamic&category=${p.category}&product=${encodeURIComponent(p.id)}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {p.label}
                          </Link>
                          <span>
                            {!p.enabled
                              ? "Deshabilitado"
                              : p.usable
                                ? "Hay evidencia utilizable"
                                : (p.issue ?? "Sin lectura utilizable")}
                            {p.total !== null
                              ? ` · ${number(p.total)} ${p.unit} almacenados`
                              : ""}
                            {p.recent !== null
                              ? ` · ${number(p.recent)} recientes / ${number(p.stale)} antiguas / ${number(p.unavailable)} sin lectura utilizable`
                              : ""}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </section>
            <aside className="flex flex-col gap-6">
              <section className="rounded-lg border bg-card p-5">
                <h2 className="text-base font-semibold">Necesita atención</h2>
                {data.attention.length ? (
                  <ul className="mt-4 flex flex-col gap-4">
                    {data.attention.map((a) => (
                      <li key={a.href + a.label} className="text-sm leading-6">
                        <p>{a.label}</p>
                        <Link
                          className="inline-flex min-h-11 items-center underline"
                          href={a.href}
                        >
                          Ver fuente y evidencia
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No se han detectado problemas en las señales disponibles. No
                    es una garantía universal.
                  </p>
                )}
              </section>
              <section className="rounded-lg border bg-card p-5">
                <h2 className="text-base font-semibold">
                  Catálogos de referencia
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Lugares, transporte y horarios publicados. No describen
                  disponibilidad en directo.
                </p>
                <Link
                  href="/dashboard/mobility?section=reference&category=places"
                  className="inline-flex min-h-11 items-center text-sm underline"
                >
                  Consultar catálogos
                </Link>
              </section>
            </aside>
          </div>
          <Field className="max-w-64">
            <FieldLabel htmlFor="overview-period">
              Periodo de actividad registrada
            </FieldLabel>
            <select
              id="overview-period"
              value={window}
              onChange={(e) => setWindow(e.target.value)}
              className="min-h-11 rounded-md border bg-background px-3 text-sm"
            >
              <option value="1h">Última hora</option>
              <option value="24h">Últimas 24 horas</option>
              <option value="7d">Últimos siete días</option>
            </select>
          </Field>
          <ActivityChart data={data.activity} />
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-base font-semibold">Actividad reciente</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Últimos cinco eventos capturados en este periodo; no cambios de
              frescura de toda la ciudad.
            </p>
            {data.recentEvents.length ? (
              <ul className="mt-3 divide-y">
                {data.recentEvents.map((e) => (
                  <li key={e.id} className="py-3 text-sm">
                    <Link
                      href={`/dashboard/activity/${e.id}`}
                      className="underline underline-offset-4"
                    >
                      {eventTypes[e.type]} · {e.source}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {eventOutcomes[e.outcome]} ·{" "}
                      <Instant value={e.occurredAt} />
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm">
                Sin eventos capturados en el periodo.
              </p>
            )}
          </section>
          <Link
            href={`/dashboard/activity?window=${window}`}
            className="text-sm underline"
          >
            Ver actividad del sistema
          </Link>
          <p className="text-xs text-muted-foreground">
            Pantalla leída: <Instant value={data.readAt} /> · Actualizar no
            rejuvenece los datos.
          </p>
        </>
      ) : null}
    </>
  );
}
