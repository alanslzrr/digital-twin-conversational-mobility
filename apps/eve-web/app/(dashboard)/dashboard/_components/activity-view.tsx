"use client";
import * as schemas from "@mobility/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useDashboard } from "@/src/dashboard-client";
import {
  eventComponents,
  eventOutcomes,
  eventTypes,
  severityCopy,
} from "./event-copy";
import { ActivityChart, number } from "./insights";
import { Instant, PageTitle, State, Technical } from "./shared";

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
  const [range, setRange] = useState(() => ({
    to: new Date().toISOString(),
    from: new Date(Date.now() - 7 * 86400000).toISOString(),
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
  );
  const value = obj(unwrap(q.data)),
    events = list(value.events);
  return (
    <>
      <PageTitle
        title={id ? "Detalle de actividad" : "Actividad del sistema"}
        description="Eventos registrados del sistema, sin datos personales ni contenidos privados de conversaciones. Solo incluye lo registrado desde el inicio de esta captura."
      />
      {!id ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="event-source">Fuente</FieldLabel>
            <select
              id="event-source"
              className="rounded-md border bg-card p-2 text-sm"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setCursor(null);
              }}
            >
              <option value="">Todas</option>
              {schemas.sourceIdSchema.options.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="event-severity">Severidad</FieldLabel>
            <select
              id="event-severity"
              className="rounded-md border bg-card p-2 text-sm"
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value);
                setCursor(null);
              }}
            >
              <option value="">Todas</option>
              {["info", "warning", "error"].map((s) => (
                <option key={s} value={s}>
                  {severityCopy[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="event-type">Tipo de evento</FieldLabel>
            <select
              id="event-type"
              className="min-h-11 rounded-md border bg-card p-2 text-sm"
              value={eventType}
              onChange={(e) => {
                setEventType(e.target.value);
                setCursor(null);
              }}
            >
              <option value="">Todos</option>
              {schemas.dashboardEventType.options.map((t) => (
                <option key={t} value={t}>
                  {eventTypes[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="event-outcome">Resultado</FieldLabel>
            <select
              id="event-outcome"
              className="min-h-11 rounded-md border bg-card p-2 text-sm"
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value);
                setCursor(null);
              }}
            >
              <option value="">Todos</option>
              {schemas.dashboardEventOutcome.options.map((t) => (
                <option key={t} value={t}>
                  {eventOutcomes[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="event-period">Periodo</FieldLabel>
            <select
              id="event-period"
              className="min-h-11 rounded-md border bg-card p-2 text-sm"
              value={customRange ? "custom" : period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setCustomRange(false);
                setCursor(null);
              }}
            >
              <option value="1h">Última hora</option>
              <option value="24h">Últimas 24 horas</option>
              <option value="7d">Últimos siete días</option>
              {customRange ? (
                <option value="custom">Intervalo personalizado</option>
              ) : null}
            </select>
          </Field>
          {(["from", "to"] as const).map((k) => (
            <Field key={k}>
              <FieldLabel htmlFor={`event-${k}`}>
                {k === "from" ? "Desde (UTC)" : "Hasta (UTC)"}
              </FieldLabel>
              <Input
                id={`event-${k}`}
                type="datetime-local"
                value={range[k].slice(0, 16)}
                onChange={(e) => {
                  if (e.target.value) {
                    const instant = new Date(`${e.target.value}Z`);
                    if (!Number.isFinite(instant.getTime())) return;
                    setRange((r) => ({ ...r, [k]: instant.toISOString() }));
                    setCustomRange(true);
                    setCursor(null);
                  }
                }}
              />
            </Field>
          ))}
          <Button
            variant="outline"
            onClick={() => {
              setCustomRange(false);
              setPeriod("7d");
              setCursor(null);
              setRange({
                to: new Date().toISOString(),
                from: new Date(Date.now() - 7 * 86400000).toISOString(),
              });
            }}
          >
            Últimos siete días
          </Button>
        </div>
      ) : (
        <Link href={`/dashboard/activity?${qs}`} className="text-sm underline">
          Volver a eventos
        </Link>
      )}
      <State loading={q.isLoading} error={q.error} empty={!events.length} />
      {!id && value.activity ? (
        <ActivityChart
          data={schemas.dashboardActivityChart.parse(value.activity)}
        />
      ) : null}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Instante",
                "Componente",
                "Fuente / job",
                "Tipo",
                "Resultado",
              ].map((h) => (
                <th key={h} className="border-b p-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={String(e.id)} className="border-b last:border-0">
                <td className="p-3 text-xs">
                  <Link
                    href={`/dashboard/activity/${e.id}?${qs}`}
                    className="inline-flex min-h-11 items-center"
                  >
                    <Instant value={e.occurredAt} />
                  </Link>
                </td>
                <td className="p-3">
                  {eventComponents[String(e.component)] ??
                    "Operación registrada"}
                </td>
                <td className="p-3 text-xs">
                  {String(e.source)} / {String(e.job)}
                </td>
                <td className="p-3">
                  {eventTypes[String(e.type)] ?? "Operación registrada"}
                </td>
                <td className="p-3">
                  <Badge variant="secondary">
                    {eventOutcomes[String(e.outcome)] ?? "Sin resultado"}
                  </Badge>
                  {e.errorCode ? (
                    <p className="mt-1 text-xs">
                      Hay un problema registrado; abre el detalle para consultar
                      su evidencia.
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cursor ? (
        <>
          <p className="text-sm text-muted-foreground">
            Página histórica: el intervalo está congelado. No se incorporan
            eventos nuevos automáticamente.
          </p>
          <Button variant="outline" onClick={() => setCursor(null)}>
            Volver a la primera página y buscar actividad nueva
          </Button>
        </>
      ) : null}
      {typeof value.nextCursor === "string" ? (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => setCursor(String(value.nextCursor))}
        >
          Siguiente página
        </Button>
      ) : null}
      {id ? (
        <>
          <section className="rounded-lg border bg-card p-5">
            <h2 className="font-semibold">Qué ocurrió</h2>
            <p className="mt-2 text-sm">
              {eventTypes[String(events[0]?.type)]} ·{" "}
              {eventOutcomes[String(events[0]?.outcome)]}
            </p>
            <p className="mt-2 text-sm">
              Duración de la operación: {number(events[0]?.durationMs)} ms. No
              equivale a latencia HTTP del proveedor.
            </p>
            <p className="mt-2 text-sm">
              La captura es parcial; este evento no certifica la frescura de
              todas las entidades.
            </p>
          </section>
          <Technical value={events[0]} />
        </>
      ) : null}
    </>
  );
}
