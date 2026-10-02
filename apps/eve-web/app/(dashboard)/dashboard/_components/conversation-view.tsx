"use client";
import { dashboardToolName } from "@mobility/contracts";
import Link from "next/link";
import { Tabs } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useDashboard, useDashboardContext } from "@/src/dashboard-client";
import { number } from "./insights";
import { Instant, PageTitle, State, Technical } from "./shared";
import { toolCopy } from "./tool-form";
import { TracePayload } from "./trace-payload";

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const rows = (v: unknown) => (Array.isArray(v) ? v.map(obj) : []);
const unwrap = (v: unknown) => obj(obj(v).data);
const titles: Record<string, string> = {
  turn_started: "Turno iniciado",
  turn_completed: "Turno finalizado",
  turn_failed: "Turno fallido",
  turn_cancelled: "Turno cancelado",
  step_started: "Paso iniciado",
  step_completed: "Paso finalizado",
  attempt_prepared: "Solicitud preparada (aún no enviada)",
  attempt_dispatched: "Solicitud enviada al modelo",
  attempt_completed: "Respuesta del modelo",
  attempt_incomplete: "Respuesta incompleta",
  attempt_failed: "Intento fallido",
  attempt_cancelled: "Intento cancelado",
  tool_requested: "Consulta solicitada",
  tool_result: "Resultado de consulta",
  tool_rejected: "Consulta rechazada",
  tool_cancelled: "Consulta cancelada",
};
const states: Record<string, string> = {
  running: "En curso",
  succeeded: "Completado",
  failed: "Fallido",
  cancelled: "Cancelado",
  rejected: "Rechazado",
  unknown: "Estado desconocido",
  prepared: "Preparado",
  incomplete: "Incompleto",
};
export function Conversations({ sessionId }: { sessionId?: string }) {
  const ctx = useDashboardContext();
  const [cursor, setCursor] = useState<string | null>(null),
    [tab, setTab] = useState("Cronología"),
    [turn, setTurn] = useState(""),
    [call, setCall] = useState(""),
    [payload, setPayload] = useState<unknown>(null);
  const requestSelection = useRef("");
  requestSelection.current = `${sessionId}:${tab}:${turn}:${call}`;
  const [turnCursor, setTurnCursor] = useState<string | null>(null);
  const previousSession = useRef(sessionId);
  useEffect(() => {
    if (previousSession.current === sessionId) return;
    previousSession.current = sessionId;
    setTurnCursor(null);
    setCursor(null);
    setTurn("");
    setCall("");
    setPayload(null);
    setTab("Cronología");
  }, [sessionId]);
  const index = useDashboard(
    !sessionId
      ? `conversations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`
      : null,
    0,
  );
  const summary = useDashboard(
    sessionId
      ? `conversations/${sessionId}/summary${turnCursor ? `?turnCursor=${encodeURIComponent(turnCursor)}` : ""}`
      : null,
    turnCursor ? 0 : 3000,
  );
  const s = unwrap(summary.data),
    usage = obj(s.usage),
    counts = obj(s.counts),
    turns = rows(s.turns);
  const events = useDashboard(
    sessionId
      ? `conversations/${sessionId}/events?${new URLSearchParams({ ...(cursor ? { cursor } : {}), ...(turn ? { turn } : {}), ...(call && tab === "Herramientas" ? { call } : {}), ...(tab === "Herramientas" ? { family: "tools" } : tab === "Modelo" ? { family: "model" } : tab === "Contenido" ? { family: "content" } : {}) })}`
      : null,
    s.state === "running" && !cursor ? 3000 : 0,
  );
  const data = unwrap(sessionId ? events.data : index.data),
    entries = rows(sessionId ? data.events : data.sessions);
  const picked = turns.find((r) => r.turnId === turn);
  const max = Math.max(
    1,
    ...turns.flatMap((r) => [
      Number(r.inputTokens ?? 0),
      Number(r.outputTokens ?? 0),
    ]),
  );
  return (
    <>
      <PageTitle
        title={sessionId ? "Mi conversación" : "Mis conversaciones"}
        description="Solo tus conversaciones con acceso vigente. Captura no exhaustiva: lo no registrado permanece desconocido, no se reconstruye."
      />
      {sessionId ? (
        <>
          <div className="flex flex-wrap gap-5 text-sm">
            <Link href="/dashboard/conversations" className="underline">
              Todas mis conversaciones
            </Link>
            <Link href={`/s/${sessionId}`} className="underline">
              Abrir chat EVE
            </Link>
          </div>
          <State loading={summary.isLoading} error={summary.error} />
          {turnCursor && summary.error?.status === 409 ? (
            <Button variant="outline" onClick={() => setTurnCursor(null)}>
              La captura cambió: volver al primer grupo de turnos
            </Button>
          ) : null}
          <section
            className="grid divide-y rounded-lg border bg-card sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4"
            aria-label="Resumen de conversación"
          >
            {[
              [
                "Tokens reportados",
                number(usage.totalTokens),
                "Solo intentos con entrada y salida conocidas. Caché y razonamiento no se suman otra vez.",
              ],
              [
                "Consultas a herramientas",
                number(counts.tools),
                "Cada consulta se cuenta una vez, aunque tenga varios eventos. No incluye descubrimiento ni ejecuciones manuales.",
              ],
              [
                "Intentos enviados al modelo",
                number(counts.dispatched),
                "Envíos observados; reintentos y compactaciones son intentos distintos.",
              ],
              [
                "Duración del turno",
                picked?.state === "running"
                  ? "En curso"
                  : picked?.durationMs != null
                    ? `${number(picked.durationMs)} ms`
                    : "Sin dato",
                turn
                  ? "Inicio a terminal instrumentados; no suma de intentos."
                  : "Selecciona un turno para consultar su duración.",
              ],
            ].map(([label, value, help]) => (
              <article key={label} className="p-5 sm:border-r last:border-r-0">
                <h2 className="text-sm text-muted-foreground">{label}</h2>
                <p className="my-3 text-2xl font-semibold tabular-nums">
                  {value}
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {help}
                </p>
              </article>
            ))}
          </section>
          <p className="text-sm text-muted-foreground">
            Entrada: {number(usage.inputTokens)} · Salida:{" "}
            {number(usage.outputTokens)} ·{" "}
            {Number(counts.missing ?? 0) > 0
              ? `${number(counts.missing)} intentos sin uso completo reportado.`
              : "El uso depende de los campos efectivamente registrados."}
          </p>
          <dl className="flex flex-wrap gap-5 text-xs text-muted-foreground">
            {[
              ["Entrada", "input", usage.inputTokens],
              ["Salida", "output", usage.outputTokens],
              [
                "Caché (subconjunto de entrada)",
                "cache",
                usage.cachedInputTokens,
              ],
              [
                "Razonamiento reportado (subconjunto, sin contenido)",
                "reasoning",
                usage.reasoningTokens,
              ],
            ].map(([label, field, value]) => (
              <div key={String(field)}>
                <dt>{String(label)}</dt>
                <dd>
                  {number(value)} · reportado en{" "}
                  {number(obj(obj(usage.coverage)[String(field)]).reported)} de{" "}
                  {number(obj(obj(usage.coverage)[String(field)]).observed)}{" "}
                  intentos retenidos
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            Herramientas: {number(counts.toolRequested)} solicitadas ·{" "}
            {number(counts.toolExecuted)} con resultado ·{" "}
            {number(counts.toolFailed)} fallidas · {number(counts.toolRejected)}{" "}
            rechazadas · {number(counts.toolCancelled)} canceladas ·{" "}
            {number(counts.toolPending)} pendientes según captura. Que falte un
            evento no demuestra que no se ejecutó.
          </p>
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-base font-semibold">
              ¿Qué turnos consumieron tokens reportados?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Hasta 50 turnos; los agregados de conversación anteriores abarcan
              los intentos retenidos. Sin dato no equivale a cero.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">Turno</th>
                    <th className="p-2">Entrada</th>
                    <th className="p-2">Salida</th>
                    <th className="p-2">Duración</th>
                    <th className="p-2">Cobertura</th>
                  </tr>
                </thead>
                <tbody>
                  {turns.map((r, i) => (
                    <tr key={String(r.turnId)} className="border-t">
                      <td className="p-2">
                        <Button
                          variant={turn === r.turnId ? "secondary" : "ghost"}
                          onClick={() => {
                            setTurn(turn === r.turnId ? "" : String(r.turnId));
                            setCursor(null);
                            setPayload(null);
                          }}
                          aria-pressed={turn === r.turnId}
                        >
                          Turno {i + 1}
                        </Button>
                      </td>
                      <td className="p-2 tabular-nums">
                        {number(r.inputTokens)}
                        {r.inputTokens != null ? (
                          <div
                            className="mt-1 h-1.5 bg-primary"
                            style={{
                              width: `${(Number(r.inputTokens) / max) * 100}%`,
                            }}
                            aria-hidden="true"
                          />
                        ) : null}
                      </td>
                      <td className="p-2 tabular-nums">
                        {number(r.outputTokens)}
                        {r.outputTokens != null ? (
                          <div
                            className="mt-1 h-1.5 bg-muted-foreground"
                            style={{
                              width: `${(Number(r.outputTokens) / max) * 100}%`,
                            }}
                            aria-hidden="true"
                          />
                        ) : null}
                      </td>
                      <td className="p-2">
                        {r.state === "running"
                          ? "En curso"
                          : r.durationMs != null
                            ? `${number(r.durationMs)} ms`
                            : "Sin medida"}
                      </td>
                      <td className="p-2">
                        {number(obj(obj(r.coverage).total).reported)} de{" "}
                        {number(r.attempts)} intentos con uso completo
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!turns.length ? (
              <p className="py-4 text-sm">
                No hay turnos instrumentados retenidos para representar el
                gráfico.
              </p>
            ) : null}
          </section>
          <p className="text-xs text-muted-foreground">
            {number(s.totalTurns)} turnos con evidencia retenida. Hasta 50 por
            página; los totales de conversación incluyen todos los intentos
            retenidos.
          </p>
          <div className="flex flex-wrap gap-2">
            {typeof s.nextTurnCursor === "string" ? (
              <Button
                variant="outline"
                onClick={() => setTurnCursor(String(s.nextTurnCursor))}
              >
                Siguiente grupo de turnos
              </Button>
            ) : null}
            {turnCursor ? (
              <Button variant="ghost" onClick={() => setTurnCursor(null)}>
                Primer grupo de turnos
              </Button>
            ) : null}
          </div>
          {call ? (
            <p className="text-sm">
              Mostrando la llamada enlazada al contenido enviado al modelo.{" "}
              <Button variant="ghost" onClick={() => setCall("")}>
                Ver todas las llamadas
              </Button>
            </p>
          ) : null}
          <Tabs.Root
            value={tab}
            onValueChange={(value) => {
              setTab(value);
              setCursor(null);
              setPayload(null);
              setCall("");
            }}
          >
            <Tabs.List
              aria-label="Detalle de conversación"
              className="flex flex-wrap gap-2"
            >
              {["Cronología", "Herramientas", "Modelo", "Contenido"].map(
                (t) => (
                  <Tabs.Trigger
                    key={t}
                    value={t}
                    className="min-h-11 rounded-md px-4 text-sm data-[state=active]:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t}
                  </Tabs.Trigger>
                ),
              )}
            </Tabs.List>
            <Tabs.Content value={tab} className="mt-4 flex flex-col gap-3">
              <State
                loading={events.isLoading}
                error={events.error}
                empty={!entries.length}
              />
              {entries.map((e) => (
                <article
                  key={String(e.id)}
                  className="rounded-lg border bg-card p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-medium">
                        {titles[String(e.kind)] ?? "Evento registrado"}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {states[String(e.status)] ?? "Estado no confirmado"}
                        {e.tool
                          ? ` · ${obj(e.toolIdentity).family === "discovery" ? "Descubrimiento de herramientas" : dashboardToolName.safeParse(obj(e.toolIdentity).canonicalName).success ? toolCopy[dashboardToolName.parse(obj(e.toolIdentity).canonicalName)].title : "Herramienta registrada"}`
                          : ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      <Instant value={e.occurredAt} />
                    </span>
                  </div>
                  {e.durationMs != null ? (
                    <p className="mt-2 text-sm tabular-nums">
                      Duración registrada: {number(e.durationMs)} ms
                    </p>
                  ) : null}
                  {e.kind && String(e.kind).startsWith("attempt_") ? (
                    <p className="mt-2 text-sm">
                      Tokens reportados: {number(e.inputTokens)} entrada /{" "}
                      {number(e.outputTokens)} salida. No permite deducir qué
                      dato influyó en la respuesta.
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {e.captureStatus === "captured"
                      ? "Contenido capturado y saneado"
                      : e.captureStatus === "partial"
                        ? "Captura parcial; puede faltar contenido"
                        : "Contenido no registrado u omitido; no se puede recuperar lo que nunca se capturó."}
                  </p>
                  {Array.isArray(e.sentCallIds) && e.sentCallIds.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {e.sentCallIds.map((id, i) => (
                        <Button
                          key={String(id)}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setTab("Herramientas");
                            setCall(String(id));
                            setTurn(String(e.turnId ?? ""));
                            setCursor(null);
                            setPayload(null);
                          }}
                        >
                          Ver resultado de herramienta enviado al modelo {i + 1}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(Array.isArray(e.payloadIds) ? e.payloadIds : []).map(
                      (id) => (
                        <Button
                          key={String(id)}
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const requested = requestSelection.current;
                            try {
                              const result = await ctx.request(
                                `conversations/${sessionId}/payloads/${id}`,
                              );
                              if (requestSelection.current === requested)
                                setPayload(unwrap(result));
                            } catch {
                              if (requestSelection.current === requested)
                                setPayload({
                                  warning:
                                    "Contenido caducado o no disponible.",
                                });
                            }
                          }}
                        >
                          Abrir contenido saneado
                        </Button>
                      ),
                    )}
                  </div>
                  <div className="mt-3">
                    <Technical value={e} />
                  </div>
                </article>
              ))}
            </Tabs.Content>
          </Tabs.Root>
          <Technical value={s} />
        </>
      ) : (
        <>
          <State
            loading={index.isLoading}
            error={index.error}
            empty={!entries.length}
          />
          <div className="overflow-hidden rounded-lg border bg-card">
            {entries.map((e, i) => (
              <article
                key={String(e.sessionId)}
                className="flex flex-wrap items-center justify-between gap-4 border-b p-5 last:border-b-0"
              >
                <div>
                  <h2 className="text-sm font-medium">Conversación {i + 1}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Creada: <Instant value={e.createdAt} /> ·{" "}
                    {e.captureStatus === "not_instrumented"
                      ? "Sin captura detallada"
                      : "Captura no exhaustiva"}
                  </p>
                </div>
                <div className="flex gap-4 text-sm">
                  <Link
                    className="inline-flex min-h-11 items-center underline"
                    href={`/s/${e.sessionId}`}
                  >
                    Abrir chat
                  </Link>
                  <Link
                    className="inline-flex min-h-11 items-center underline"
                    href={`/dashboard/conversations/${e.sessionId}`}
                  >
                    Examinar conversación
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {typeof data.nextCursor === "string" ? (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => setCursor(String(data.nextCursor))}
        >
          Siguiente página
        </Button>
      ) : null}
      {payload ? (
        <div>
          <TracePayload value={payload} />
          <Button
            variant="ghost"
            className="mt-3"
            onClick={() => setPayload(null)}
          >
            Cerrar contenido
          </Button>
        </div>
      ) : null}
      <p className="text-xs leading-5 text-muted-foreground">
        Retención de hasta siete días. Límites: 16 MiB y 10.000 eventos por
        conversación, 256 MiB por evaluador; entrada modelo 512 KB, salida 64
        KB, argumentos 8 KB y resultados 32 KB. Sin estimación de coste ni
        reconstrucción histórica.
      </p>
    </>
  );
}
