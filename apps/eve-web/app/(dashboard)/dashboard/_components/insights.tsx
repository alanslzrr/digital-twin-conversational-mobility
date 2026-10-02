"use client";
import type {
  DashboardActivityChart,
  DashboardMetric,
} from "@mobility/contracts";
import Link from "next/link";
import { Instant } from "./shared";
export const number = (n: unknown) =>
  typeof n === "number"
    ? new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(n)
    : "Sin dato";
export function MetricStrip({ metrics }: { metrics: DashboardMetric[] }) {
  return (
    <section
      aria-label="Indicadores de movilidad"
      className="grid divide-y overflow-hidden rounded-lg border bg-card sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4"
    >
      {metrics.map((m) => (
        <article
          key={m.id}
          className="flex min-w-0 flex-col gap-2 p-5 sm:border-r last:border-r-0"
        >
          <h2 className="text-sm font-medium text-muted-foreground">
            {m.label}
          </h2>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {number(m.value)}
          </p>
          <p className="text-sm">{m.unit}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {m.coverage}
          </p>
          {m.missingReason ? (
            <p className="text-xs leading-5">{m.missingReason}</p>
          ) : null}
          <details className="mt-auto text-xs leading-5">
            <summary className="min-h-8 cursor-pointer py-1">
              Qué mide y qué excluye
            </summary>
            <p>{m.definition}</p>
            <p className="mt-2">
              Selección: {m.selection}. Procedencia: {m.provenance}.
            </p>
            <p className="mt-2">
              Periodo de evidencia:{" "}
              {m.period.from ? (
                <>
                  <Instant value={m.period.from} /> —{" "}
                </>
              ) : (
                "Vigencia actual evaluada a "
              )}
              <Instant value={m.period.to} />.
            </p>
            <p className="mt-2 text-muted-foreground">{m.excludes}</p>
            <p className="mt-2">
              Evaluado: <Instant value={m.evaluatedAt} />
            </p>
          </details>
          <Link
            href={m.detailHref}
            className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            Consultar los datos
          </Link>
        </article>
      ))}
    </section>
  );
}
export function FreshnessBreakdown({
  total,
  recent,
  stale,
  unavailable,
  static: reference,
  unit,
}: {
  total: number;
  recent: number;
  stale: number;
  unavailable: number;
  static: number;
  unit: string;
}) {
  const states = [
    ["Lecturas recientes", recent, "bg-primary"],
    ["Datos antiguos", stale, "bg-muted-foreground"],
    ["Sin lectura utilizable", unavailable, "bg-destructive"],
    ["Referencia", reference, "bg-accent-foreground"],
  ] as const;
  return (
    <section
      className="rounded-lg border bg-card p-4"
      aria-label="Antigüedad del producto"
    >
      <h2 className="text-sm font-medium">
        ¿Qué parte de este producto puedo usar?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {number(total)} {unit} en toda esta selección; no solo en esta página.
      </p>
      {total > 0 ? (
        <div
          className="my-3 flex h-3 overflow-hidden rounded-full"
          aria-hidden="true"
        >
          {states.map(([label, n, color]) => (
            <span
              key={label}
              className={color}
              style={{ width: `${(n / total) * 100}%` }}
            />
          ))}
        </div>
      ) : null}
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {states.map(([label, n]) => (
          <li key={label}>
            {label}:{" "}
            <span className="font-medium tabular-nums">{number(n)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
export function ActivityChart({ data }: { data: DashboardActivityChart }) {
  const max = Math.max(
    1,
    ...data.bins.flatMap((b) => [b.publications ?? 0, b.errors ?? 0]),
  );
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="text-base font-semibold">
        ¿Cuándo se guardó información y cuándo hubo problemas?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Publicaciones y errores registrados. No representa evolución del tráfico
        ni garantiza frescura.
      </p>
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <span>
          Publicaciones:{" "}
          <strong className="tabular-nums">{number(data.publications)}</strong>
        </span>
        <span>
          Errores registrados:{" "}
          <strong className="tabular-nums">{number(data.errors)}</strong>
        </span>
      </div>
      {data.firstRetainedEventAt ? (
        <svg
          viewBox="0 0 700 160"
          role="img"
          aria-label="Publicaciones y errores por intervalo; datos equivalentes en la tabla"
          className="mt-4 w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <title>Publicaciones y errores por intervalo</title>
          {data.bins.map((b, i) => {
            const width = 680 / data.bins.length,
              x = 10 + i * width;
            return (
              <g key={b.from}>
                {b.publications !== null ? (
                  <rect
                    x={x}
                    y={145 - (b.publications / max) * 130}
                    width={width * 0.38}
                    height={(b.publications / max) * 130}
                    className="fill-primary"
                  />
                ) : null}
                {b.errors !== null ? (
                  <rect
                    x={x + width * 0.4}
                    y={145 - (b.errors / max) * 130}
                    width={width * 0.38}
                    height={(b.errors / max) * 130}
                    className="fill-destructive"
                  />
                ) : null}
              </g>
            );
          })}
          <line x1="10" x2="690" y1="145" y2="145" className="stroke-border" />
        </svg>
      ) : (
        <p className="py-6 text-sm">
          No hay evidencia retenida para representar una serie. No equivale a
          cero actividad.
        </p>
      )}
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        <Instant value={data.from} /> — <Instant value={data.to} />. Captura no
        exhaustiva. Los huecos anteriores a la primera evidencia retenida no se
        convierten en cero.
      </p>
      <details className="mt-4 text-sm">
        <summary className="min-h-11 cursor-pointer py-2">
          Ver intervalos y valores
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="p-2">Intervalo (Madrid)</th>
                <th className="p-2">Publicaciones</th>
                <th className="p-2">Errores</th>
              </tr>
            </thead>
            <tbody>
              {data.bins.map((b) => (
                <tr key={b.from} className="border-t">
                  <td className="p-2 text-xs">
                    <Instant value={b.from} /> — <Instant value={b.to} />
                  </td>
                  <td className="p-2 tabular-nums">{number(b.publications)}</td>
                  <td className="p-2 tabular-nums">{number(b.errors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
