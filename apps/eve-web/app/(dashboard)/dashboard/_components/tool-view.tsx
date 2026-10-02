"use client";
import type { dashboardToolCatalog } from "@mobility/contracts";
import * as schemas from "@mobility/contracts";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useDashboard, useDashboardContext } from "@/src/dashboard-client";
import { InspectionResult } from "./inspection-result";
import { PageTitle, State, Technical } from "./shared";
import { effectCopy, ToolFields, toolCopy } from "./tool-form";

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function unwrap(v: unknown) {
  return obj(v).data;
}
function _list(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(obj) : [];
}
const toolInputs = {
  resolve_place: schemas.resolvePlaceInputSchema,
  resolve_address: schemas.resolveAddressInputSchema,
  plan_journey: schemas.journeyRequestSchema,
  get_departures: schemas.departuresInputSchema,
  get_emt_arrivals: schemas.emtArrivalsInputSchema,
  get_crtm_timetable: schemas.crtmTimetableInputSchema,
  get_incidents: schemas.incidentsInputSchema,
  get_bike_availability: schemas.bikesInputSchema,
  get_environment: schemas.environmentInputSchema,
  get_road_state: schemas.roadInputSchema,
  get_parking: schemas.parkingInputSchema,
  get_historical_state: schemas.historyInputSchema,
  get_source_health: schemas.sourceHealthInputSchema,
  get_line_status: schemas.lineStatusInputSchema,
  get_network_status: schemas.networkStatusInputSchema,
  get_mobility_snapshot: schemas.mobilitySnapshotInputSchema,
};
type Tool = z.infer<typeof dashboardToolCatalog>["tools"][number];
export function Tools({ name }: { name?: string }) {
  const ctx = useDashboardContext();
  const q = useDashboard("tools", 0);
  const tools = (q.data as { tools?: Tool[] })?.tools ?? [];
  const [input, setInput] = useState("{}"),
    [result, setResult] = useState<unknown>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const requestId = useRef<string | null>(null);
  const selection = useRef(name);
  selection.current = name;
  useEffect(() => {
    selection.current = name;
    setInput("{}");
    setResult(null);
    setError("");
    setPending(false);
    setConfirmed(false);
    requestId.current = null;
  }, [name]);
  const tool = tools.find((t) => t.name === name);
  const submit = async (execute: boolean) => {
    if (!tool) return;
    const selected = name;
    setPending(true);
    setError("");
    try {
      const checked = toolInputs[tool.name].safeParse(JSON.parse(input));
      if (!checked.success)
        throw new Error(
          "Revisa los campos obligatorios y sus valores permitidos antes de consultar.",
        );
      const parsed = checked.data;
      if (new TextEncoder().encode(input).length > 8192)
        throw new Error("Máximo 8.192 bytes de argumentos");
      requestId.current = execute ? crypto.randomUUID() : null;
      const response = await ctx.request(
        execute ? "executions" : "inspect",
        "POST",
        execute
          ? {
              requestId: requestId.current,
              tool: tool.name,
              input: parsed,
              confirmEffects: true,
            }
          : { tool: tool.name, input: parsed },
      );
      if (selection.current === selected) setResult(unwrap(response));
    } catch (e) {
      if (selection.current === selected)
        setError(e instanceof Error ? e.message : "No disponible");
    } finally {
      if (selection.current === selected) setPending(false);
    }
  };
  return (
    <>
      <PageTitle
        title={tool ? toolCopy[tool.name].title : "Consultas"}
        description="Consultar los datos guardados no ejecuta la herramienta ni pide una lectura nueva. Ejecutarla manualmente puede consultar fuentes y mantener su actualización."
      />
      <State loading={q.isLoading} error={q.error} />
      {!name ? (
        <div className="grid gap-3 md:grid-cols-2">
          {tools.map((t) => (
            <Link
              key={t.name}
              href={`/dashboard/tools/${t.name}`}
              className="rounded-lg border bg-card p-5 hover:bg-accent"
            >
              <h2 className="text-sm font-medium">{toolCopy[t.name].title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {toolCopy[t.name].question}
              </p>
              <p className="mt-3 text-xs">
                {t.possibleEffects.length
                  ? `Efectos posibles: ${t.possibleEffects.map((effect) => effectCopy[effect]).join(" · ")}`
                  : "Solo almacenamiento"}
              </p>
            </Link>
          ))}
        </div>
      ) : tool ? (
        <>
          <Link href="/dashboard/tools" className="text-sm underline">
            Volver al catálogo
          </Link>
          <p className="text-sm leading-6 text-muted-foreground">
            {toolCopy[tool.name].question}
          </p>
          <Technical value={JSON.parse(tool.inputSchemaJson)} />
          <form
            className="flex flex-col gap-4 rounded-lg border bg-card p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(false);
            }}
          >
            <ToolFields
              name={tool.name}
              schema={tool.inputSchemaJson}
              input={input}
              onChange={setInput}
            />
            <FieldGroup>
              <details>
                <summary className="min-h-11 cursor-pointer text-sm">
                  Configuración avanzada
                </summary>
                <Field>
                  <FieldLabel htmlFor="tool-input">
                    Configuración avanzada JSON · máximo 8.192 bytes
                  </FieldLabel>
                  <Textarea
                    id="tool-input"
                    rows={7}
                    maxLength={8192}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="font-mono text-xs"
                  />
                </Field>
              </details>
              <Field>
                <FieldLabel>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />{" "}
                  Confirmo la ejecución manual y sus posibles efectos
                </FieldLabel>
                <p className="text-xs text-muted-foreground">
                  Máximo una reserva por evaluador, seis ejecuciones/minuto y
                  sesenta/día. No activa consentimiento externo de direcciones:
                  allowExternal sigue requiriendo consentimiento específico.
                </p>
              </Field>
            </FieldGroup>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" type="submit" disabled={pending}>
                Consultar almacenado
              </Button>
              <Button
                type="button"
                disabled={pending || !confirmed}
                onClick={() => void submit(true)}
              >
                Ejecutar herramienta
              </Button>
              {requestId.current ? (
                <Button
                  variant="ghost"
                  type="button"
                  disabled={pending}
                  onClick={async () => {
                    const selected = name;
                    try {
                      const response = await ctx.request(
                        `executions/${requestId.current}`,
                      );
                      if (selection.current !== selected) return;
                      setResult(unwrap(response));
                      setError("");
                    } catch {
                      if (selection.current === selected)
                        setError(
                          "No se pudo recuperar el resultado. No se ha reejecutado.",
                        );
                    }
                  }}
                >
                  Recuperar estado por ID
                </Button>
              ) : null}
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {pending ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => ctx.clear()}
              >
                Cancelar solicitud
              </Button>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Inspector: hasta 256 KB. Contexto EVE: hasta 32 KB. El resultado
              del inspector no certifica lo recibido por el modelo.
            </p>
            {pending ? (
              <p role="status" className="text-sm">
                Solicitud en curso. Cancelar la pantalla no demuestra que el
                proveedor haya cancelado.
              </p>
            ) : null}
          </form>
          {result ? (
            <>
              <InspectionResult value={result} />
              <Technical value={result} />
            </>
          ) : null}
        </>
      ) : (
        <p>Herramienta no registrada.</p>
      )}
    </>
  );
}
