"use client";
import { Spinner } from "@/components/ui/spinner";
export function Instant({ value }: { value: unknown }) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return <span>No disponible</span>;
  return (
    <time dateTime={value} title={value}>
      {new Date(value).toLocaleString("es-ES", {
        timeZone: "Europe/Madrid",
        timeZoneName: "short",
      })}
    </time>
  );
}
export function Technical({ value }: { value: unknown }) {
  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Detalle técnico saneado
      </summary>
      <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-5">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
export function State({
  loading,
  error,
  empty,
}: {
  loading: boolean;
  error: unknown;
  empty?: boolean;
}) {
  return (
    <>
      {loading ? (
        <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
          <Spinner />
          Cargando datos almacenados…
        </div>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive p-4 text-sm"
        >
          No se pudo actualizar. Los datos anteriores conservan su fecha; no se
          consideran nuevos.
        </p>
      ) : null}
      {!loading && !error && empty ? (
        <p className="rounded-lg border bg-card p-8 text-sm text-muted-foreground">
          Sin registros almacenados para esta selección.
        </p>
      ) : null}
    </>
  );
}
export function PageTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
export const publicLabel = (key: string) =>
  (
    ({
      vehiclesPerHour: "Intensidad de tráfico",
      occupancyPercent: "Ocupación del sensor",
      loadPercent: "Carga del sensor",
      serviceLevel: "Nivel de servicio publicado",
      maximumEur: "Máximo documental (EUR)",
      publishedDate: "Documento comprobado (fecha)",
      effectiveFrom: "Vigente desde",
      arrivalSeconds: "Llegada del horario publicado",
      departureSeconds: "Salida del horario publicado",
      calendarId: "Calendario publicado",
      wheelchair: "Accesibilidad declarada para silla de ruedas",
      kind: "Tipo de lugar",
      bikes: "Bicicletas disponibles",
      docks: "Anclajes disponibles",
      freeSpaces: "Plazas libres publicadas",
      category: "Categoría publicada",
      installed: "Estación instalada",
      renting: "Alquiler habilitado",
      returning: "Devolución habilitada",
      temperature: "Temperatura",
      precipitation: "Precipitación acumulada",
      precipitation_probability: "Probabilidad de precipitación",
      wind: "Viento",
      gust: "Racha de viento",
      sky: "Estado del cielo",
      basis: "Tipo de medida",
      period: "Periodo publicado",
      line: "Línea",
      destination: "Destino",
      estimateSecondsAtObservation: "Estimación al observar (s)",
      observedAt: "Observado",
      startsAt: "Inicio de vigencia",
      endsAt: "Fin de vigencia",
      detail: "Descripción publicada",
      road: "Carretera",
      providerValidity: "Vigencia publicada",
      status: "Estado",
      components: "Componentes",
      staticFeed: "Calendario estático",
      staticCatalogs: "Catálogos estáticos",
      leaseUntil: "Reserva hasta",
      tool: "Herramienta",
      executionMode: "Modo de consulta",
      evaluatedAt: "Evaluado",
      requestId: "Identificador de solicitud",
      truncated: "Truncado",
      input: "Entrada",
      result: "Resultado",
      workers: "Procesos",
      products: "Productos",
      streams: "Flujos",
      sources: "Fuentes",
      resources: "Recursos",
      arrivals: "Llegadas EMT",
      routes: "Versiones de routing",
      ingestionEnabled: "Ingestión habilitada",
      activeUntil: "Ventana de actividad",
      captureVersion: "Versión de captura",
      captureCoverage: "Cobertura de captura",
      readAt: "Leído en pantalla",
      ingestedAt: "Incorporado",
      checkedAt: "Comprobado",
      issuedAt: "Emitido",
      validFrom: "Válido desde",
      validTo: "Válido hasta",
      lastSeenAt: "Última señal",
      lastPrunedAt: "Última purga",
      state: "Estado",
      name: "Nombre",
      source: "Fuente",
      sourceId: "Fuente",
      productId: "Producto",
      freshness: "Frescura",
      coverage: "Cobertura",
      version: "Versión",
      lastAttemptAt: "Último intento",
      lastSuccessAt: "Último éxito",
      nextDueAt: "Próximo intento",
      errorCode: "Código de error",
      errorStage: "Etapa de error",
      reason: "Motivo",
      limitations: "Limitaciones",
      retainedBytes: "Bytes retenidos",
      eventCount: "Eventos retenidos",
      knownGaps: "Huecos conocidos",
      omittedEvents: "Eventos omitidos",
      counts: "Recuentos",
      usage: "Tokens reportados",
      inputTokens: "Entrada",
      outputTokens: "Salida",
      cachedInputTokens: "Entrada en caché",
      durationMs: "Duración (ms)",
      warning: "Límites de interpretación",
      count: "Recuento",
      total: "Total",
      fresh: "Recientes",
      stale: "Antiguos",
      unavailable: "No disponibles",
      enabled: "Habilitado",
      failures: "Fallos",
      attempts: "Intentos",
      createdAt: "Creado",
      expiresAt: "Caduca",
      completedAt: "Finalizado",
      isError: "Error",
      lastActivityAt: "Última actividad",
      captureStatus: "Estado de captura",
      captureStartedAt: "Inicio de captura",
      firstObservedAt: "Primera señal",
      lastObservedAt: "Última señal",
      schemaVersion: "Versión de contrato",
    }) as Record<string, string>
  )[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2");
export function ObjectCards({ value }: { value: unknown }) {
  const entries =
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value)
      : [];
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries
        .filter(
          ([k, v]) =>
            k !== "schemaVersion" && (typeof v !== "object" || v === null),
        )
        .map(([k, v]) => (
          <div key={k} className="rounded-lg border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{publicLabel(k)}</dt>
            <dd className="mt-2 break-words text-sm font-medium">
              {v === null ? (
                "No disponible"
              ) : typeof v === "boolean" ? (
                v ? (
                  "Sí"
                ) : (
                  "No"
                )
              ) : typeof v === "string" && /^(?:\d{4}-\d\d-\d\dT)/.test(v) ? (
                <Instant value={v} />
              ) : typeof v === "string" ? (
                ((
                  {
                    best_effort: "Captura no exhaustiva",
                    partial: "Parcial",
                    unknown: "Desconocido",
                    disabled: "Deshabilitado",
                    running: "En curso",
                    recent: "Reciente",
                    stale: "Antiguo",
                    static: "Estático/versionado",
                    unavailable: "No disponible",
                    not_instrumented: "Sin captura en este periodo",
                  } as Record<string, string>
                )[v] ?? v)
              ) : (
                String(v)
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}
