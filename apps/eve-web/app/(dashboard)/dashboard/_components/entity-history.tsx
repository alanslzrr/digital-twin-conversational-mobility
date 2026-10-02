"use client";
import type {
  DashboardEntity,
  DashboardEntitySeries,
} from "@mobility/contracts";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { useDashboard } from "@/src/dashboard-client";
import { number } from "./insights";
import { Instant, publicLabel, State } from "./shared";
export function EntityHistory({ entity }: { entity: DashboardEntity }) {
  const [open, setOpen] = useState(false),
    [window, setWindow] = useState("6h"),
    [magnitude, setMagnitude] = useState(
      entity.category === "bikes"
        ? "bikes"
        : entity.category === "parking"
          ? "freeSpaces"
          : entity.category === "traffic"
            ? "vehiclesPerHour"
            : entity.evidence.productId === "aemet"
              ? "temperature"
              : "value",
    );
  const supported =
    entity.category === "bikes" ||
    entity.category === "parking" ||
    entity.category === "traffic" ||
    entity.evidence.productId === "madrid-air" ||
    entity.evidence.productId === "aemet";
  const q = useDashboard(
    open && supported
      ? `entities/${entity.category}/${encodeURIComponent(entity.id)}/history?${new URLSearchParams({ window, magnitude, product: entity.evidence.productId })}`
      : null,
    0,
  );
  const data = q.data as DashboardEntitySeries | undefined;
  const max = Math.max(1, ...(data?.points ?? []).map((p) => p.value)),
    min = Math.min(0, ...(data?.points ?? []).map((p) => p.value));
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="text-base font-semibold">
        ¿Cómo cambió esta magnitud en los registros retenidos?
      </h2>
      {!supported ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Este producto no tiene una serie de observaciones por identidad
          estable en el histórico retenido. Una predicción no es una observación
          del pasado.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Lectura del histórico existente, no consulta al proveedor. Hasta 24
            horas; conserva observación e incorporación por punto.
          </p>
          {!open ? (
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => setOpen(true)}
            >
              Consultar histórico guardado
            </Button>
          ) : (
            <>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="history-period">
                    Periodo retenido
                  </FieldLabel>
                  <select
                    id="history-period"
                    value={window}
                    onChange={(e) => setWindow(e.target.value)}
                    className="min-h-11 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="1h">Una hora</option>
                    <option value="6h">Seis horas</option>
                    <option value="24h">24 horas</option>
                  </select>
                </Field>
                {entity.category === "bikes" ||
                entity.evidence.productId === "aemet" ? (
                  <Field>
                    <FieldLabel htmlFor="history-measure">Magnitud</FieldLabel>
                    <select
                      id="history-measure"
                      value={magnitude}
                      onChange={(e) => setMagnitude(e.target.value)}
                      className="min-h-11 rounded-md border bg-background px-3 text-sm"
                    >
                      {(entity.category === "bikes"
                        ? ["bikes", "docks"]
                        : [
                            "temperature",
                            "relative_humidity",
                            "precipitation",
                            "mean_wind_speed",
                            "maximum_wind_gust",
                            "station_pressure",
                          ]
                      ).map((m) => (
                        <option key={m} value={m}>
                          {publicLabel(m)}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
              </div>
              <State loading={q.isLoading} error={q.error} />
              {data ? (
                <>
                  <p className="mt-3 text-sm">
                    {data.unit} · {number(data.points.length)} muestras{" "}
                    {data.reduced
                      ? "(reducidas a la última de cada intervalo)"
                      : "retenidas"}
                  </p>
                  {data.points.length ? (
                    <svg
                      viewBox="0 0 700 180"
                      className="mt-4 w-full"
                      role="img"
                      aria-label="Muestras observadas, sin interpolación; fechas y valores en la tabla"
                    >
                      <title>Observaciones retenidas sin interpolación</title>
                      {data.points.map((p) => {
                        const x =
                            20 +
                            ((Date.parse(p.observedAt) -
                              Date.parse(data.from)) /
                              (Date.parse(data.to) - Date.parse(data.from))) *
                              660,
                          y = 155 - ((p.value - min) / (max - min)) * 130;
                        return (
                          <circle
                            key={p.observedAt}
                            cx={x}
                            cy={y}
                            r="3"
                            className="fill-primary"
                          />
                        );
                      })}
                      <line
                        x1="20"
                        x2="680"
                        y1="155"
                        y2="155"
                        className="stroke-border"
                      />
                    </svg>
                  ) : (
                    <p className="mt-4 text-sm">
                      No hay muestras retenidas para esta entidad y periodo. No
                      se fabrica una curva.
                    </p>
                  )}
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    {data.warning}
                  </p>
                  <details className="mt-3 text-sm">
                    <summary className="min-h-11 cursor-pointer py-2">
                      Ver muestras y procedencia
                    </summary>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr>
                            <th className="p-2">Observado</th>
                            <th className="p-2">Incorporado</th>
                            <th className="p-2">Valor ({data.unit})</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.points.map((p) => (
                            <tr key={p.observedAt} className="border-t">
                              <td className="p-2 text-xs">
                                <Instant value={p.observedAt} />
                              </td>
                              <td className="p-2 text-xs">
                                <Instant value={p.ingestedAt} />
                              </td>
                              <td className="p-2 tabular-nums">
                                {number(p.value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              ) : null}
            </>
          )}
        </>
      )}
    </section>
  );
}
