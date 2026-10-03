"use client";
import type {
  DashboardEntity,
  DashboardEntitySeries,
} from "@mobility/contracts";
import { useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { useDashboard } from "@/src/dashboard-client";
import { number } from "./insights";
import { EntityHistoryChart } from "./refinement/EntityHistoryChart";
import { publicLabel, State } from "./shared";
export function EntityHistory({ entity }: { entity: DashboardEntity }) {
  const [window, setWindow] = useState("6h"),
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
    supported
      ? `entities/${entity.category}/${encodeURIComponent(entity.id)}/history?${new URLSearchParams({ window, magnitude, product: entity.evidence.productId })}`
      : null,
    0,
  );
  const data = q.data as DashboardEntitySeries | undefined;
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="text-base font-semibold">Retained measurement history</h2>
      {!supported ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No stable-identity observation series is available for this product. A
          forecast is not a past observation.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Read retained history, not the provider. Up to 24 hours with
            observation and ingestion time per point.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="history-period">Retained period</FieldLabel>
              <select
                id="history-period"
                value={window}
                onChange={(e) => setWindow(e.target.value)}
                className="min-h-11 rounded-md border bg-background px-3 text-sm"
              >
                <option value="1h">1 hour</option>
                <option value="6h">6 hours</option>
                <option value="24h">24 hours</option>
              </select>
            </Field>
            {entity.category === "bikes" ||
            entity.evidence.productId === "aemet" ? (
              <Field>
                <FieldLabel htmlFor="history-measure">Measurement</FieldLabel>
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
          <State data={q.data} loading={q.isLoading} error={q.error} />
          {data ? (
            <>
              <p className="mt-3 text-sm">
                {data.unit} · {number(data.points.length)} samples{" "}
                {data.reduced
                  ? "(last observation retained per interval)"
                  : "retained"}
              </p>
              <EntityHistoryChart data={data} label={publicLabel(magnitude)} />
              <p className="dc-meta">{data.warning}</p>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
