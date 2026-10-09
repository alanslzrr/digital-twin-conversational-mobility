"use client";
import type { ControlAction, ControlSnapshot } from "@mobility/contracts";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  ControlForm,
  DataTable,
  fieldNumber,
  fieldValue,
  PanelCard,
  useControlText,
} from "./control-ui";

export function UsagePanel({
  data,
  admin,
  run,
}: {
  data: ControlSnapshot;
  admin: boolean;
  run: (action: ControlAction) => Promise<void>;
}) {
  const { text, money } = useControlText();
  const [filter, setFilter] = useState("");
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <PanelCard
          title={text("Contabilizado", "Accounted")}
          description={text(
            "Puede incluir importes estimados; no es una factura.",
            "May include estimates; this is not an invoice.",
          )}
        >
          <p className="text-2xl tabular-nums">
            {money(data.totals.usedMicros)}
          </p>
        </PanelCard>
        <PanelCard title={text("Reservado / pendiente", "Reserved / pending")}>
          <p className="text-2xl tabular-nums">
            {money(data.totals.reservedMicros)}
          </p>
          <p>
            {data.totals.unknownAttempts}{" "}
            {text("intentos inciertos", "uncertain attempts")}
          </p>
        </PanelCard>
        <PanelCard title={text("Tokens comunicados", "Reported tokens")}>
          <p>
            {data.totals.inputTokens.toLocaleString()}{" "}
            {text("entrada", "input")} /{" "}
            {data.totals.outputTokens.toLocaleString()}{" "}
            {text("salida", "output")}
          </p>
          <p>
            {data.totals.calls} {text("llamadas", "calls")}
          </p>
        </PanelCard>
      </div>
      <PanelCard title={text("Patrocinios", "Sponsorships")}>
        <DataTable
          headings={[
            text("Usuario", "User"),
            text("Límite", "Limit"),
            text("Disponible", "Available"),
            text("Vencimiento", "Expiry"),
            text("Estado", "State"),
          ]}
          rows={data.grants.map((g) => ({
            id: g.id,
            cells: [
              data.users.find((u) => u.id === g.userId)?.label ??
                data.identity.label,
              money(g.budgetMicros),
              money(g.availableMicros),
              new Date(g.expiresAt).toLocaleString(),
              <Badge key="status" variant="outline">
                {g.status === "suspended"
                  ? text("Suspendido", "Suspended")
                  : g.status === "expired"
                    ? text("Vencido", "Expired")
                    : g.status === "exhausted"
                      ? text("Agotado", "Exhausted")
                      : g.budgetWarning
                        ? "≥ 80 %"
                        : text("Activo", "Active")}
              </Badge>,
            ],
          }))}
        />
      </PanelCard>
      <PanelCard
        title={text(
          "Consumo por usuario, proveedor y modelo",
          "Usage by user, provider and model",
        )}
        description={text(
          "Todo el historial del ledger; importes desconocidos conservan su reserva.",
          "Entire ledger history; unknown charges retain their reservation.",
        )}
      >
        <DataTable
          headings={[
            text("Usuario", "User"),
            text("Proveedor · modelo", "Provider · model"),
            text(
              "Llamadas / tokens entrada-salida",
              "Calls / input-output tokens",
            ),
            text("Contabilizado / reservado", "Accounted / reserved"),
          ]}
          rows={data.consumption.map((row) => ({
            id: `${row.userId}:${row.providerId}:${row.modelId}`,
            cells: [
              data.users.find((u) => u.id === row.userId)?.label ??
                data.identity.label,
              `${data.providers.find((p) => p.id === row.providerId)?.name ?? row.providerId} · ${data.models.find((m) => m.id === row.modelId)?.modelId ?? row.modelId}`,
              `${row.calls} / ${row.inputTokens}–${row.outputTokens}`,
              `${money(row.usedMicros)} / ${money(row.reservedMicros)}`,
            ],
          }))}
        />
      </PanelCard>
      <PanelCard
        title={text("Últimos 200 intentos", "Latest 200 attempts")}
        description={text(
          "Incluye herramientas, compactaciones y fallos. Los totales superiores abarcan todo el ledger.",
          "Includes tool-loop steps, compactions and failures. Totals above cover the entire ledger.",
        )}
      >
        <Field className="mb-4">
          <FieldLabel htmlFor="usage-filter">
            {text(
              "Filtrar por usuario, modelo o proveedor",
              "Filter by user, model or provider",
            )}
          </FieldLabel>
          <Input
            id="usage-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </Field>
        <DataTable
          headings={[
            text("Referencia / fecha", "Reference / date"),
            text("Usuario · proveedor · modelo", "User · provider · model"),
            text("Tokens", "Tokens"),
            text("Coste / origen", "Cost / source"),
            text("Estado", "State"),
          ]}
          rows={data.attempts
            .filter((a) =>
              [
                a.userId,
                data.users.find((u) => u.id === a.userId)?.label,
                data.providers.find((p) => p.id === a.providerId)?.name,
                data.models.find((m) => m.id === a.modelId)?.modelId,
              ]
                .join(" ")
                .toLowerCase()
                .includes(filter.toLowerCase()),
            )
            .map((a) => ({
              id: a.id,
              cells: [
                <div key="ref">
                  <code className="text-xs">{a.id}</code>
                  <p>{new Date(a.createdAt).toLocaleString()}</p>
                  <small>
                    {a.purpose} · {a.durationMs ?? "—"} ms
                  </small>
                </div>,
                `${data.users.find((u) => u.id === a.userId)?.label ?? data.identity.label} · ${data.providers.find((p) => p.id === a.providerId)?.name ?? a.providerId} · ${data.models.find((m) => m.id === a.modelId)?.modelId ?? a.modelId}`,
                a.usage ? (
                  <div key="usage">
                    {a.usage.inputTokens} / {a.usage.outputTokens}
                    <p>
                      {text("Caché / razonamiento", "Cache / reasoning")}:{" "}
                      {a.usage.cachedTokens ?? "—"} /{" "}
                      {a.usage.reasoningTokens ?? "—"}
                    </p>
                  </div>
                ) : (
                  text("Desconocidos", "Unknown")
                ),
                <div key="cost">
                  {money(a.costMicros)}
                  <p>{a.costSource}</p>
                  {a.costMicros === null ? (
                    <small>
                      {text("Reserva", "Reservation")}:{" "}
                      {money(a.reservedMicros)}
                    </small>
                  ) : null}
                </div>,
                <div key="state">
                  {a.state}
                  <p>{a.errorCode}</p>
                  {admin &&
                  a.state === "unknown" &&
                  a.costSource !== "operator" ? (
                    <ControlForm
                      fields={[
                        {
                          name: "cost",
                          label: text(
                            "Coste conciliado USD",
                            "Reconciled cost USD",
                          ),
                          type: "number",
                          min: 0,
                          step: "0.000001",
                        },
                        {
                          name: "note",
                          label: text(
                            "Justificación (mínimo 10 caracteres)",
                            "Explanation (10 characters minimum)",
                          ),
                        },
                      ]}
                      submit={text("Conciliar", "Reconcile")}
                      onSubmit={(v) =>
                        run({
                          action: "attempt.reconcile",
                          id: a.id,
                          costMicros: Math.ceil(fieldNumber(v, "cost") * 1e6),
                          note: fieldValue(v, "note"),
                        })
                      }
                    />
                  ) : null}
                </div>,
              ],
            }))}
        />
      </PanelCard>
    </div>
  );
}
