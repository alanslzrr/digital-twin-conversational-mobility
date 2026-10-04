"use client";

import type {
  DashboardEntity,
  DashboardEntitySeries,
} from "@mobility/contracts";
import { useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { useUi } from "@/i18n/provider";
import { useDashboard } from "@/src/dashboard-client";
import { number } from "./insights";
import { EntityHistoryChart } from "./refinement/EntityHistoryChart";
import { publicLabel, State } from "./shared";
export function EntityHistory({ entity }: { entity: DashboardEntity }) {
  const { t, copy, numberLocale } = useUi();

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
      <h2 className="text-base font-semibold">
        {t("entityHistory.retainedMeasurementHistory")}
      </h2>
      {!supported ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t(
            "entityHistory.noStableIdentityObservationSeriesIsAvailableForThis",
          )}
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("entityHistory.readRetainedHistoryNotTheProviderUpTo24")}
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="history-period">
                {t("entityHistory.retainedPeriod")}
              </FieldLabel>
              <select
                id="history-period"
                value={window}
                onChange={(e) => setWindow(e.target.value)}
                className="min-h-11 rounded-md border bg-background px-3 text-sm"
              >
                <option value="1h"> {t("commonFragments.hours1hour")} </option>
                <option value="6h"> {t("commonFragments.hours6hours")} </option>
                <option value="24h">
                  {" "}
                  {t("commonFragments.hours24hours")}{" "}
                </option>
              </select>
            </Field>
            {entity.category === "bikes" ||
            entity.evidence.productId === "aemet" ? (
              <Field>
                <FieldLabel htmlFor="history-measure">
                  {t("entityHistory.measurement")}
                </FieldLabel>
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
                      {copy(publicLabel(m))}
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
                {copy(data.unit)} · {number(data.points.length, numberLocale)}{" "}
                {t("commonFragments.samples")}{" "}
                {data.reduced
                  ? t("entityHistory.lastObservationRetainedPerInterval")
                  : t("presentation.retained")}
              </p>
              <EntityHistoryChart
                data={data}
                label={copy(publicLabel(magnitude))}
              />
              <p className="dc-meta">{copy(data.warning)}</p>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
