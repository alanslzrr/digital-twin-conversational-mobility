"use client";
import type {
  DashboardEntity,
  dashboardToolCatalog,
} from "@mobility/contracts";
import * as schemas from "@mobility/contracts";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DashboardHttpError,
  useDashboard,
  useDashboardContext,
} from "@/src/dashboard-client";
import {
  Instant,
  ObjectCards,
  PageTitle,
  publicLabel,
  State,
  Technical,
} from "./shared";

const MapView = dynamic(() => import("./map"), { ssr: false });
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
export function Readable({
  value,
  depth = 0,
}: {
  value: unknown;
  depth?: number;
}) {
  if (!value || typeof value !== "object")
    return (
      <span className="text-sm">
        {value === null || value === undefined
          ? "No disponible"
          : String(value)}
      </span>
    );
  if (depth > 3)
    return (
      <span className="text-xs text-muted-foreground">
        Contenido adicional en el detalle técnico.
      </span>
    );
  if (Array.isArray(value))
    return (
      <div className="flex flex-col gap-3">
        {value.slice(0, 20).map((v, index) => (
          <div
            key={String(obj(v).id ?? index)}
            className="rounded-lg border bg-card p-4"
          >
            <Readable value={v} depth={depth + 1} />
          </div>
        ))}
        {value.length > 20 ? (
          <p className="text-xs text-muted-foreground">
            Vista legible: 20 de {value.length} registros devueltos.
          </p>
        ) : null}
        {!value.length ? (
          <p className="text-sm text-muted-foreground">
            Lista vacía almacenada. Su interpretación depende de frescura y
            cobertura.
          </p>
        ) : null}
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      <ObjectCards value={value} />
      {Object.entries(value)
        .filter(([, v]) => v !== null && typeof v === "object")
        .map(([k, v]) => (
          <section key={k}>
            <h3 className="mb-2 text-sm font-medium">{publicLabel(k)}</h3>
            <Readable value={v} depth={depth + 1} />
          </section>
        ))}
    </div>
  );
}
export function Overview() {
  const q = useDashboard("overview");
  const data = unwrap(q.data);
  return (
    <>
      <PageTitle
        title="Resumen"
        description="Evidencia almacenada, estado técnico y cobertura por componente. Un worker activo no demuestra que una fuente esté fresca."
      />
      <State loading={q.isLoading} error={q.error} />
      {data ? <Readable value={data} /> : null}
      <Technical value={data} />
    </>
  );
}
const categories = [
  ["places", "Lugares y transporte"],
  ["departures", "Salidas y llegadas"],
  ["incidents", "Incidencias"],
  ["bikes", "BiciMAD"],
  ["environment", "Aire y meteorología"],
  ["traffic", "Tráfico"],
  ["parking", "Aparcamiento"],
];
const freshnessLabels: Record<string, string> = {
  recent: "Reciente",
  recently_checked: "Comprobado recientemente",
  stale: "Antiguo",
  unavailable: "No disponible",
  static: "Estático/versionado",
  unknown: "Desconocido",
};
export function Mobility({
  category: initialCategory,
  id,
}: {
  category?: string;
  id?: string;
}) {
  const [category, setCategory] = useState(initialCategory ?? "places"),
    [source, setSource] = useState(""),
    [freshness, setFreshness] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [cursor, setCursor] = useState<string | null>(null),
    [map, setMap] = useState(false);
  const qs = new URLSearchParams({
    category,
    ...(source ? { source } : {}),
    ...(freshness ? { freshness } : {}),
    ...(filter ? { search: filter } : {}),
    ...(cursor ? { cursor } : {}),
  });
  const q = useDashboard(
    id ? `entities/${category}/${encodeURIComponent(id)}` : `entities?${qs}`,
  );
  const page = (id ? unwrap(q.data) : q.data) as
    | { entities?: DashboardEntity[]; nextCursor?: string; limited?: boolean }
    | undefined;
  const retried = useRef(new Set<string>());
  useEffect(() => {
    if (
      q.error instanceof DashboardHttpError &&
      q.error.status === 409 &&
      cursor &&
      !retried.current.has(cursor)
    ) {
      retried.current.add(cursor);
      setCursor(null);
    }
  }, [q.error, cursor]);
  const entities = page?.entities ?? [];
  return (
    <>
      <PageTitle
        title={id ? "Detalle de entidad" : "Datos de movilidad"}
        description="Observación, incorporación y lectura son instantes distintos. Los catálogos no son tiempo real; cero no significa ausencia."
      />
      {id ? (
        <Link className="text-sm underline" href="/dashboard/mobility">
          Volver al explorador
        </Link>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setCursor(null);
            setFilter(search);
          }}
          className="rounded-lg border bg-card p-4"
        >
          <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="category">Categoría</FieldLabel>
              <select
                id="category"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setCursor(null);
                }}
              >
                {categories.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="source">Fuente</FieldLabel>
              <select
                id="source"
                className="h-9 rounded-md border bg-background px-3 text-sm"
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
              <FieldLabel htmlFor="freshness">Frescura</FieldLabel>
              <select
                id="freshness"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={freshness}
                onChange={(e) => {
                  setFreshness(e.target.value);
                  setCursor(null);
                }}
              >
                <option value="">Todas</option>
                {Object.entries(freshnessLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="search">Buscar entidad</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="search"
                  maxLength={100}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Button type="submit" variant="outline" size="sm">
                  Filtrar
                </Button>
              </div>
            </Field>
          </FieldGroup>
        </form>
      )}
      <State loading={q.isLoading} error={q.error} empty={!entities.length} />
      {!id ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setMap(!map)}
        >
          {map ? "Ocultar mapa" : "Mostrar mapa"}
        </Button>
      ) : null}
      {map ? (
        <MapView
          category={category}
          source={source}
          freshness={freshness}
          search={filter}
          onSelect={(id) => {
            window.location.href = `/dashboard/mobility/${category}/${encodeURIComponent(id)}`;
          }}
        />
      ) : null}
      {entities.length ? (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                {[
                  "Entidad",
                  "Producto/fuente",
                  "Frescura",
                  "Observación",
                  "Incorporación",
                  "Valores",
                ].map((h) => (
                  <th key={h} className="p-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entities.map((e) => (
                <tr
                  key={`${e.evidence.productId}:${e.id}`}
                  className="border-b last:border-b-0"
                >
                  <td className="p-3">
                    <Link
                      className="font-medium underline-offset-4 hover:underline"
                      href={`/dashboard/mobility/${category}/${encodeURIComponent(e.id)}`}
                    >
                      {e.name}
                    </Link>
                    {e.latitude === null ? (
                      <p className="text-xs text-muted-foreground">
                        Sin coordenadas publicadas
                      </p>
                    ) : null}
                  </td>
                  <td className="p-3 text-xs">
                    {e.evidence.productId}
                    <br />
                    {e.evidence.sourceId}
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">
                      {freshnessLabels[e.evidence.freshness]}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {e.evidence.reason ?? e.evidence.coverage}
                    </p>
                  </td>
                  <td className="p-3 text-xs">
                    <Instant value={e.evidence.observedAt} />
                  </td>
                  <td className="p-3 text-xs">
                    <Instant value={e.evidence.ingestedAt} />
                  </td>
                  <td className="p-3 text-xs">
                    {e.measurements.length
                      ? e.measurements.map((m) => (
                          <div key={m.name}>
                            {m.name}:{" "}
                            {m.value === null
                              ? "No disponible"
                              : String(m.value)}{" "}
                            {m.unit}
                          </div>
                        ))
                      : "Sin medida publicada"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {entities.length} filas devueltas en esta página{" "}
          {page?.limited ? "· resultado limitado" : ""}
        </span>
        <div className="flex gap-2">
          {cursor ? (
            <Button size="sm" variant="outline" onClick={() => setCursor(null)}>
              Primera página
            </Button>
          ) : null}
          {page?.nextCursor ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCursor(page.nextCursor ?? null)}
            >
              Siguiente
            </Button>
          ) : null}
        </div>
      </div>
      {id ? <Technical value={page} /> : null}
    </>
  );
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
  const tool = tools.find((t) => t.name === name);
  const submit = async (execute: boolean) => {
    if (!tool) return;
    setPending(true);
    setError("");
    try {
      const checked = toolInputs[tool.name].safeParse(JSON.parse(input));
      if (!checked.success)
        throw new Error(
          "Argumentos no válidos: " +
            checked.error.issues
              .map((i) => i.path.join(".") + ": " + i.message)
              .join("; "),
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
      setResult(unwrap(response));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No disponible");
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <PageTitle
        title={tool ? tool.name : "Herramientas MCP"}
        description="Consultar almacenado no ejecuta MCP. La ejecución manual usa el ejecutor real, sin llamar al modelo, y puede adquirir datos o renovar actividad."
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
              <h2 className="font-mono text-sm font-medium">{t.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t.title}</p>
              <p className="mt-3 text-xs">
                {t.possibleEffects.length
                  ? `Efectos posibles: ${t.possibleEffects.join(", ")}`
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
            {tool.description}
          </p>
          <Technical value={JSON.parse(tool.inputSchemaJson)} />
          <form
            className="flex flex-col gap-4 rounded-lg border bg-card p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(false);
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="tool-input">
                  Argumentos JSON · máximo 8.192 bytes
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
                    try {
                      setResult(
                        unwrap(
                          await ctx.request(`executions/${requestId.current}`),
                        ),
                      );
                      setError("");
                    } catch {
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
              <Readable value={result} />
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
export function Sources({ id }: { id?: string }) {
  const q = useDashboard(id ? `sources/${encodeURIComponent(id)}` : "sources");
  const value = unwrap(q.data);
  return (
    <>
      <PageTitle
        title={id ? `Fuente: ${id}` : "Fuentes e ingestión"}
        description="Estado técnico, cobertura y políticas actuales. Último mantenimiento no equivale a borrado físico por reloj cuando el runtime está apagado."
      />
      <State loading={q.isLoading} error={q.error} />
      {!id ? (
        <div className="flex flex-wrap gap-2">
          {schemas.sourceIdSchema.options.map((s) => (
            <Link
              key={s}
              href={`/dashboard/sources/${s}`}
              className="rounded-md border bg-card px-3 py-2 text-sm"
            >
              {s}
            </Link>
          ))}
        </div>
      ) : (
        <Link className="text-sm underline" href="/dashboard/sources">
          Todas las fuentes
        </Link>
      )}
      {value ? <Readable value={value} /> : null}
      <Technical value={value} />
    </>
  );
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
    [cursor, setCursor] = useState<string | null>(null);
  const { visible, paused } = useDashboardContext();
  useEffect(() => {
    if (id || cursor || !visible || paused || customRange) return;
    const timer = setInterval(
      () =>
        setRange({
          to: new Date().toISOString(),
          from: new Date(Date.now() - 7 * 86400000).toISOString(),
        }),
      15000,
    );
    return () => clearInterval(timer);
  }, [id, cursor, visible, paused, customRange]);
  const qs = new URLSearchParams({
    ...range,
    ...(eventType ? { type: eventType } : {}),
    ...(severity ? { severity } : {}),
    ...(source ? { source } : {}),
    ...(cursor ? { cursor } : {}),
  });
  const q = useDashboard(
    `${id ? `events/${id}` : "events"}?${qs}`,
    id || cursor ? 0 : 15000,
  );
  const value = obj(unwrap(q.data)),
    events = list(value.events);
  return (
    <>
      <PageTitle
        title={id ? "Detalle de evento" : "Eventos"}
        description="Feed operativo saneado, sin sesiones, argumentos ni contenidos privados. Captura desde la instrumentación; no se importa stdout histórico."
      />
      {!id ? (
        <div className="flex flex-wrap gap-3">
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
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="event-type">Tipo de evento</FieldLabel>
            <Input
              id="event-type"
              value={eventType}
              maxLength={100}
              onChange={(e) => {
                setEventType(e.target.value);
                setCursor(null);
              }}
              placeholder="publication, refresh…"
            />
          </Field>
          {(["from", "to"] as const).map((k) => (
            <Field key={k}>
              <FieldLabel htmlFor={"event-" + k}>
                {k === "from" ? "Desde (UTC)" : "Hasta (UTC)"}
              </FieldLabel>
              <Input
                id={"event-" + k}
                type="datetime-local"
                value={range[k].slice(0, 16)}
                onChange={(e) => {
                  if (e.target.value) {
                    setRange((r) => ({
                      ...r,
                      [k]: new Date(e.target.value + "Z").toISOString(),
                    }));
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
        <Link href="/dashboard/activity" className="text-sm underline">
          Volver a eventos
        </Link>
      )}
      <State loading={q.isLoading} error={q.error} empty={!events.length} />
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
                  <Link href={`/dashboard/activity/${e.id}`}>
                    <Instant value={e.occurredAt} />
                  </Link>
                </td>
                <td className="p-3">{String(e.component)}</td>
                <td className="p-3 text-xs">
                  {String(e.source)} / {String(e.job)}
                </td>
                <td className="p-3">{String(e.type)}</td>
                <td className="p-3">
                  <Badge variant="secondary">{String(e.outcome)}</Badge>
                  {e.errorCode ? (
                    <p className="mt-1 text-xs">{String(e.errorCode)}</p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
          <Readable value={events[0]} />
          <Technical value={events[0]} />
        </>
      ) : null}
    </>
  );
}
export function Conversations({ sessionId }: { sessionId?: string }) {
  const [cursor, setCursor] = useState<string | null>(null),
    [tab, setTab] = useState("Cronología"),
    [payload, setPayload] = useState<unknown>(null);
  const ctx = useDashboardContext();
  const selectionRef = useRef(sessionId);
  useEffect(() => {
    selectionRef.current = sessionId;
    setCursor(null);
    setPayload(null);
    setTab("Cronología");
  }, [sessionId]);
  const index = useDashboard(
    sessionId
      ? null
      : `conversations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    0,
  );
  const summary = useDashboard(
    sessionId ? `conversations/${sessionId}/summary` : null,
    3000,
  );
  const summaryData = obj(unwrap(summary.data));
  const events = useDashboard(
    sessionId
      ? `conversations/${sessionId}/events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`
      : null,
    summaryData.state === "running" && !cursor ? 3000 : 0,
  );
  const value = obj(unwrap(sessionId ? events.data : index.data)),
    rows = list(sessionId ? value.events : value.sessions);
  const filtered = sessionId
    ? rows.filter((e) =>
        tab === "Herramientas"
          ? String(e.kind).startsWith("tool_")
          : tab === "Modelo"
            ? String(e.kind).startsWith("attempt_")
            : tab === "Contenido"
              ? Array.isArray(e.payloadIds) && e.payloadIds.length
              : true,
      )
    : rows;
  return (
    <>
      <PageTitle
        title={sessionId ? "Telemetría de conversación" : "Mis conversaciones"}
        description="Solo sesiones propias con acceso vigente. Captura saneada hasta siete días: 16 MiB y 10.000 eventos por sesión; 256 MiB por evaluador. Entrada modelo 512 KB, salida 64 KB, argumentos 8 KB y resultados EVE 32 KB. No se duplica la transcripción EVE."
      />
      {sessionId ? (
        <>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/conversations" className="text-sm underline">
              Todas mis conversaciones
            </Link>
            <Link href={`/s/${sessionId}`} className="text-sm underline">
              Abrir chat EVE
            </Link>
          </div>
          <Readable value={summaryData} />
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Telemetría"
          >
            {["Cronología", "Herramientas", "Modelo", "Contenido"].map((t) => (
              <Button
                role="tab"
                aria-selected={tab === t}
                key={t}
                variant={tab === t ? "secondary" : "ghost"}
                onClick={() => setTab(t)}
              >
                {t}
              </Button>
            ))}
          </div>
        </>
      ) : null}
      <State
        loading={sessionId ? events.isLoading : index.isLoading}
        error={sessionId ? events.error : index.error}
        empty={!rows.length}
      />
      <div className="flex flex-col gap-3">
        {filtered.map((e) => (
          <article
            key={String(e.id ?? e.sessionId)}
            className="rounded-lg border bg-card p-5"
          >
            {sessionId ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <Badge variant="secondary">{String(e.kind)}</Badge>
                  <span className="text-sm">{String(e.status)}</span>
                  <span className="text-xs text-muted-foreground">
                    <Instant value={e.occurredAt} />
                  </span>
                </div>
                <ObjectCards value={e} />
                {Array.isArray(e.payloadIds) ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {e.payloadIds.map((id: unknown) => (
                      <Button
                        size="sm"
                        variant="outline"
                        key={String(id)}
                        onClick={async () => {
                          try {
                            const requested = sessionId;
                            const response = await ctx.request(
                              `conversations/${sessionId}/payloads/${id}`,
                            );
                            if (selectionRef.current === requested)
                              setPayload(unwrap(response));
                          } catch {
                            setPayload({
                              status: "Contenido caducado o no disponible",
                            });
                          }
                        }}
                      >
                        Abrir contenido saneado
                      </Button>
                    ))}
                  </div>
                ) : null}
                <Technical value={e} />
              </>
            ) : (
              <>
                <h2 className="font-mono text-sm">{String(e.sessionId)}</h2>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                  <span>
                    Creación: <Instant value={e.createdAt} />
                  </span>
                  <span>
                    Acceso hasta: <Instant value={e.expiresAt} />
                  </span>
                  <span>
                    Última actividad: <Instant value={e.lastActivityAt} />
                  </span>
                  <span>Captura: {String(e.captureStatus)}</span>
                </div>
                <div className="mt-4 flex gap-4 text-sm">
                  <Link className="underline" href={`/s/${e.sessionId}`}>
                    Abrir chat
                  </Link>
                  <Link
                    className="underline"
                    href={`/dashboard/conversations/${e.sessionId}`}
                  >
                    Ver telemetría
                  </Link>
                </div>
              </>
            )}
          </article>
        ))}
      </div>
      {typeof value.nextCursor === "string" ? (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => setCursor(String(value.nextCursor))}
        >
          Siguiente página
        </Button>
      ) : null}
      {payload ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Contenido saneado</h2>
          <ObjectCards value={payload} />
          {list(obj(obj(payload).content).messages).map((message, index) => (
            <article
              key={String(obj(message).id ?? index)}
              className="rounded-lg border bg-card p-4"
            >
              <h3 className="mb-2 text-sm font-medium">
                {String(message.role)}
              </h3>
              {list(message.parts).map((part, i) => (
                <p
                  key={String(part.callId ?? i)}
                  className="whitespace-pre-wrap break-words text-sm leading-6"
                >
                  {String(
                    part.text ??
                      part.arguments ??
                      part.output ??
                      "Contenido omitido",
                  )}
                </p>
              ))}
            </article>
          ))}
          <Technical value={payload} />
          <Button
            variant="ghost"
            className="self-start"
            onClick={() => setPayload(null)}
          >
            Cerrar contenido
          </Button>
        </section>
      ) : null}
    </>
  );
}
