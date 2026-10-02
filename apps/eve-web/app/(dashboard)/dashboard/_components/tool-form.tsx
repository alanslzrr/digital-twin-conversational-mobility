"use client";
import type { DashboardEntity, DashboardToolName } from "@mobility/contracts";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useDashboard } from "@/src/dashboard-client";
import { publicLabel } from "./shared";

const labels: Record<string, string> = {
  query: "Lugar o dirección que buscas",
  source: "Fuente de información",
  limit: "Máximo de resultados",
  kind: "Tipo de información",
  network: "Red de transporte",
  line: "Línea publicada",
  placeId: "Lugar guardado seleccionado",
  originId: "Lugar de origen",
  destinationId: "Lugar de destino",
  minutesAgo: "Hace cuántos minutos",
  at: "Instante de consulta (ISO, con zona)",
  mode: "Cómo interpretar el histórico",
  allowExternal: "Autorizo consultar esta dirección al servicio externo",
  date: "Fecha de servicio",
  departureTime: "Hora de salida",
  pollutant: "Contaminante publicado",
  stationId: "Estación publicada",
  parkingId: "Aparcamiento publicado",
  municipality: "Municipio publicado",
  includeDaily: "Incluir predicción diaria",
};
export const toolCopy: Record<
  DashboardToolName,
  { title: string; question: string; example: object }
> = {
  resolve_place: {
    title: "Encontrar un lugar guardado",
    question: "¿Qué estaciones o lugares guardados coinciden con este nombre?",
    example: { query: "Callao" },
  },
  resolve_address: {
    title: "Buscar una dirección",
    question:
      "¿Hay una ubicación guardada para esta dirección? La búsqueda externa requiere autorización específica.",
    example: { query: "Puerta del Sol, Madrid", allowExternal: false },
  },
  plan_journey: {
    title: "Planificar un recorrido",
    question:
      "¿Qué itinerarios puede calcular el sistema entre dos lugares? Requiere ejecución explícita del motor de rutas.",
    example: { departureTime: "now", modes: ["TRANSIT"], preferences: {} },
  },
  get_departures: {
    title: "Consultar salidas",
    question:
      "¿Qué salidas puede calcular el motor para un lugar? No se reconstruyen como resultado completo desde lecturas parciales.",
    example: {},
  },
  get_emt_arrivals: {
    title: "Consultar llegadas EMT",
    question:
      "¿Qué estimaciones están guardadas para una parada? Consultar almacenado no activa nueva demanda.",
    example: {},
  },
  get_crtm_timetable: {
    title: "Consultar horario publicado",
    question:
      "¿Qué horario y calendario publicados corresponden a la selección? No son estimaciones de llegada.",
    example: {},
  },
  get_incidents: {
    title: "Consultar incidencias y avisos",
    question:
      "¿Qué avisos publicados están guardados y qué vigencia tienen? No garantiza servicio normal cuando no hay avisos.",
    example: { source: "emt" },
  },
  get_bike_availability: {
    title: "Consultar bicicletas",
    question:
      "¿Qué bicicletas y anclajes se publicaron para esta ubicación y cuándo se observaron?",
    example: { query: "Callao" },
  },
  get_environment: {
    title: "Consultar aire y meteorología",
    question:
      "¿Qué observaciones, predicciones o avisos hay guardados? Cada tipo conserva sus fechas y unidades.",
    example: { kind: "air" },
  },
  get_road_state: {
    title: "Consultar sensores de tráfico",
    question:
      "¿Qué intensidad y ocupación publicaron los sensores? No son tiempos de viaje ni incidencias DGT.",
    example: { query: "Castellana" },
  },
  get_parking: {
    title: "Consultar aparcamientos",
    question:
      "¿Qué plazas publicó un aparcamiento? Las categorías y tarifas no se suman como una disponibilidad única.",
    example: { query: "Plaza Mayor" },
  },
  get_historical_state: {
    title: "Consultar evidencia histórica",
    question:
      "¿Qué revisiones permanecen guardadas para ese instante? Devuelve un índice parcial, no una reconstrucción completa.",
    example: { source: "bicimad", minutesAgo: 30 },
  },
  get_source_health: {
    title: "Examinar una fuente",
    question:
      "¿Qué señal técnica y evidencia guardada hay de la fuente? Un proceso activo no certifica datos recientes.",
    example: { source: "bicimad" },
  },
  get_line_status: {
    title: "Examinar una línea",
    question:
      "¿Qué catálogo, cobertura y avisos guardados reconoce el sistema para una línea?",
    example: { source: "emt", line: "1" },
  },
  get_network_status: {
    title: "Examinar una red",
    question:
      "¿Qué evidencia publicada hay guardada para esta red? No equivale a garantía de funcionamiento normal.",
    example: { source: "emt" },
  },
  get_mobility_snapshot: {
    title: "Consultar resumen almacenado",
    question:
      "¿Qué evidencia conserva el sistema por producto y cuáles son sus ausencias y límites?",
    example: {},
  },
};
export const effectCopy: Record<string, string> = {
  activate_window: "Mantener la ventana de actualización",
  acquire_provider: "Consultar al proveedor",
  demand_weather: "Registrar demanda meteorológica",
  write_cache: "Guardar un resultado en caché",
  calculate_otp: "Calcular itinerarios con el motor de rutas",
};
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const optionNames: Record<string, string> = {
  air: "Calidad del aire",
  weather: "Meteorología",
  observation: "Observación publicada",
  hourly_forecast: "Predicción horaria",
  daily_forecast: "Predicción diaria",
  warnings: "Avisos meteorológicos",
  event: "Observaciones con última revisión retenida",
  knowledge: "Solo lo conocido hasta ese instante",
  metro: "Metro",
  "light-rail": "Metro ligero",
  interurban: "Autobuses interurbanos",
  emt: "Autobuses EMT",
  bicimad: "BiciMAD",
  renfe: "Renfe",
  crtm: "Transporte CRTM",
  TRANSIT: "Transporte público",
  WALK: "Caminar",
  BIKE: "Bicicleta (no disponible)",
  CAR: "Coche (no disponible)",
};
export function ToolFields({
  schema,
  input,
  onChange,
  name,
}: {
  schema: string;
  input: string;
  onChange: (value: string) => void;
  name: DashboardToolName;
}) {
  const placeTools = [
    "plan_journey",
    "get_departures",
    "get_emt_arrivals",
    "get_crtm_timetable",
    "get_accessibility",
    "get_environment",
    "get_bike_availability",
  ];
  const placesQuery = useDashboard(
    placeTools.includes(name)
      ? `entities?section=reference&category=places&product=reference:places&limit=100${name === "get_emt_arrivals" ? "&source=emt" : name === "get_crtm_timetable" ? "&source=crtm" : ""}`
      : null,
    0,
  );
  const places =
    (placesQuery.data as { entities?: DashboardEntity[] } | undefined)
      ?.entities ?? [];
  let value: Record<string, unknown> = {},
    definition: Record<string, unknown> = {};
  try {
    value = record(JSON.parse(input));
    definition = record(JSON.parse(schema));
  } catch {
    return (
      <p className="text-sm">
        Corrige el JSON avanzado para continuar usando el formulario.
      </p>
    );
  }
  const properties = record(definition.properties);
  const update = (key: string, v: unknown) => {
    const next = { ...value };
    if (v === "" || v === undefined) delete next[key];
    else next[key] = v;
    onChange(JSON.stringify(next, null, 2));
  };
  return (
    <FieldGroup>
      <p className="text-sm text-muted-foreground">{toolCopy[name].question}</p>
      <Button
        variant="outline"
        type="button"
        className="self-start"
        onClick={() =>
          onChange(
            JSON.stringify(
              {
                ...toolCopy[name].example,
                ...Object.fromEntries(
                  Object.keys(properties)
                    .filter((key) =>
                      ["placeId", "originId", "destinationId"].includes(key),
                    )
                    .flatMap((key, i) => {
                      const place = places[i] ?? places[0];
                      return place ? [[key, place.id]] : [];
                    }),
                ),
              },
              null,
              2,
            ),
          )
        }
      >
        Cargar ejemplo sin ejecutarlo
      </Button>
      {Object.entries(properties).map(([key, raw]) => {
        const p = record(raw),
          type = p.type,
          options = Array.isArray(p.enum) ? p.enum : null,
          id = `argument-${key}`;
        if (key === "departureTime")
          return (
            <Field key={key}>
              <FieldLabel htmlFor={id}>Cuándo quieres salir</FieldLabel>
              <select
                id={id}
                value={
                  value[key] === "now" || value[key] == null ? "now" : "date"
                }
                onChange={(e) =>
                  update(
                    key,
                    e.target.value === "now" ? "now" : new Date().toISOString(),
                  )
                }
                className="min-h-11 rounded-md border bg-background px-3 text-sm"
              >
                <option value="now">Ahora</option>
                <option value="date">Elegir fecha y hora</option>
              </select>
              {value[key] && value[key] !== "now" ? (
                <Input
                  type="datetime-local"
                  aria-label="Fecha y hora de salida, hora local del navegador"
                  value={new Date(
                    Date.parse(String(value[key])) -
                      new Date(String(value[key])).getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16)}
                  onChange={(e) => {
                    if (e.target.value)
                      update(key, new Date(e.target.value).toISOString());
                  }}
                />
              ) : null}
            </Field>
          );
        if (key === "preferences")
          return (
            <fieldset key={key} className="flex flex-wrap gap-5">
              <legend className="mb-3 text-sm font-medium">
                Preferencias del recorrido
              </legend>
              {[
                ["maxWalkingMinutes", "Máximo de minutos caminando", 15, 120],
                ["maxTransfers", "Máximo de transbordos", 2, 6],
              ].map(([field, label, fallback, max]) => (
                <Field key={String(field)}>
                  <FieldLabel htmlFor={`preference-${field}`}>
                    {String(label)}
                  </FieldLabel>
                  <Input
                    id={`preference-${field}`}
                    type="number"
                    min={0}
                    max={Number(max)}
                    value={Number(
                      record(value.preferences)[String(field)] ?? fallback,
                    )}
                    onChange={(e) =>
                      update("preferences", {
                        ...record(value.preferences),
                        [String(field)]: Number(e.target.value),
                      })
                    }
                  />
                </Field>
              ))}
              <Field>
                <FieldLabel htmlFor="preference-wheelchair">
                  Accesibilidad para silla de ruedas
                </FieldLabel>
                <input
                  id="preference-wheelchair"
                  type="checkbox"
                  checked={record(value.preferences).wheelchair === true}
                  onChange={(e) =>
                    update("preferences", {
                      ...record(value.preferences),
                      wheelchair: e.target.checked,
                    })
                  }
                  className="size-5"
                />
              </Field>
            </fieldset>
          );
        const itemOptions = record(p.items).enum;
        if (type === "array" && Array.isArray(itemOptions))
          return (
            <fieldset key={key}>
              <legend className="mb-3 text-sm font-medium">
                {labels[key] ?? "Formas de desplazarse"}
              </legend>
              <div className="flex flex-wrap gap-5">
                {itemOptions.map((option) => (
                  <label
                    key={String(option)}
                    className="flex min-h-11 items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      disabled={["BIKE", "CAR"].includes(String(option))}
                      checked={
                        Array.isArray(value[key]) &&
                        (value[key] as unknown[]).includes(option)
                      }
                      onChange={(e) =>
                        update(
                          key,
                          e.target.checked
                            ? [
                                ...(Array.isArray(value[key])
                                  ? (value[key] as unknown[])
                                  : []),
                                option,
                              ]
                            : (Array.isArray(value[key])
                                ? (value[key] as unknown[])
                                : []
                              ).filter((v) => v !== option),
                        )
                      }
                    />
                    {optionNames[String(option)] ?? String(option)}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        if (type === "object")
          return (
            <p key={key} className="text-sm text-muted-foreground">
              {labels[key] ?? publicLabel(key)}: configuración estructurada en
              el apartado avanzado.
            </p>
          );
        return (
          <Field key={key}>
            <FieldLabel htmlFor={id}>
              {labels[key] ?? publicLabel(key)}
            </FieldLabel>
            {["placeId", "originId", "destinationId"].includes(key) ? (
              <>
                <select
                  id={id}
                  value={String(value[key] ?? "")}
                  onChange={(e) => update(key, e.target.value)}
                  className="min-h-11 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Selecciona un lugar guardado</option>
                  {places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Hasta 100 lugares de referencia guardados. Si no aparece,
                  busca primero el lugar; puedes introducir su identificador en
                  configuración avanzada. No se crea una ubicación ficticia.
                </p>
              </>
            ) : options ? (
              <select
                id={id}
                value={String(value[key] ?? "")}
                onChange={(e) => update(key, e.target.value)}
                className="min-h-11 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Usar valor por defecto</option>
                {options.map((option) => (
                  <option key={String(option)} value={String(option)}>
                    {optionNames[String(option)] ?? String(option)}
                  </option>
                ))}
              </select>
            ) : type === "boolean" ? (
              <input
                id={id}
                type="checkbox"
                checked={value[key] === true}
                onChange={(e) => update(key, e.target.checked)}
                className="size-5"
              />
            ) : (
              <Input
                id={id}
                type={
                  type === "number" || type === "integer"
                    ? "number"
                    : key === "date"
                      ? "date"
                      : "text"
                }
                min={typeof p.minimum === "number" ? p.minimum : undefined}
                max={typeof p.maximum === "number" ? p.maximum : undefined}
                value={
                  Array.isArray(value[key])
                    ? (value[key] as unknown[]).join(", ")
                    : String(value[key] ?? "")
                }
                onChange={(e) =>
                  update(
                    key,
                    type === "number" || type === "integer"
                      ? e.target.value === ""
                        ? undefined
                        : Number(e.target.value)
                      : type === "array"
                        ? e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                        : e.target.value,
                  )
                }
                className="min-h-11"
              />
            )}
            {type === "array" ? (
              <p className="text-xs text-muted-foreground">
                Separa las opciones por comas; se validan contra el contrato de
                la herramienta.
              </p>
            ) : null}
          </Field>
        );
      })}
    </FieldGroup>
  );
}
