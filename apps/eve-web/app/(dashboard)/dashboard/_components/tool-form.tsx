"use client";
import type { DashboardEntity, DashboardToolName } from "@mobility/contracts";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useDashboard } from "@/src/dashboard-client";
import { Segmented } from "./primitives";
import { publicLabel } from "./shared";

const labels: Record<string, string> = {
  query: "Place or address query",
  source: "Information source",
  limit: "Result limit",
  kind: "Information type",
  network: "Transport network",
  line: "Published line",
  placeId: "Selected stored place",
  originId: "Origin place",
  destinationId: "Destination place",
  minutesAgo: "Minutes ago",
  at: "Query instant (ISO with offset)",
  mode: "History interpretation",
  allowExternal: "I authorize sending this address to the external service",
  date: "Service date",
  departureTime: "Departure time",
  pollutant: "Published pollutant",
  stationId: "Published station",
  parkingId: "Published parking",
  municipality: "Published municipality",
  includeDaily: "Include daily forecast",
};
export const toolCopy: Record<
  DashboardToolName,
  { title: string; question: string; example: object }
> = {
  resolve_place: {
    title: "Find a stored place",
    question: "Which stored places match this name?",
    example: { query: "Callao" },
  },
  resolve_address: {
    title: "Resolve an address",
    question:
      "Stored address evidence. External lookup requires specific consent.",
    example: { query: "Puerta del Sol, Madrid", allowExternal: false },
  },
  plan_journey: {
    title: "Plan a journey",
    question:
      "Calculate a journey between two places through explicit routing execution.",
    example: { departureTime: "now", modes: ["TRANSIT"], preferences: {} },
  },
  get_departures: {
    title: "Get departures",
    question:
      "Departures require explicit routing execution; partial evidence is not a complete result.",
    example: {},
  },
  get_emt_arrivals: {
    title: "Get EMT arrivals",
    question: "Inspect stored stop estimates without activating new demand.",
    example: {},
  },
  get_crtm_timetable: {
    title: "Read published timetable",
    question: "Published timetable and calendar, not arrival estimates.",
    example: {},
  },
  get_incidents: {
    title: "Read incidents and alerts",
    question:
      "Stored notices and validity. No notices does not guarantee normal service.",
    example: { source: "emt" },
  },
  get_bike_availability: {
    title: "Read bike availability",
    question: "Published bikes, docks and observation times for this place.",
    example: { query: "Callao" },
  },
  get_environment: {
    title: "Read air and weather",
    question:
      "Stored observations, forecasts and warnings with distinct times and units.",
    example: { kind: "air" },
  },
  get_road_state: {
    title: "Read traffic sensors",
    question:
      "Sensor intensity and occupancy, not journey times or DGT incidents.",
    example: { query: "Castellana" },
  },
  get_parking: {
    title: "Read parking",
    question:
      "Published parking spaces. Categories and tariffs are not summed together.",
    example: { query: "Plaza Mayor" },
  },
  get_historical_state: {
    title: "Read historical evidence",
    question:
      "Retained revisions for an instant: a partial index, not a reconstruction.",
    example: { source: "bicimad", minutesAgo: 30 },
  },
  get_source_health: {
    title: "Inspect source health",
    question:
      "Source evidence and technical signals. Active workers do not certify recent evidence.",
    example: { source: "bicimad" },
  },
  get_line_status: {
    title: "Inspect a line",
    question: "Stored catalog coverage and alerts for a line.",
    example: { source: "emt", line: "1" },
  },
  get_network_status: {
    title: "Inspect network status",
    question: "Stored network evidence, not a normal-service guarantee.",
    example: { source: "emt" },
  },
  get_mobility_snapshot: {
    title: "Read mobility snapshot",
    question: "Stored evidence, gaps and limits by product.",
    example: {},
  },
};
export const effectCopy: Record<string, string> = {
  activate_window: "Maintain the activity window",
  acquire_provider: "Query the provider",
  demand_weather: "Register weather demand",
  write_cache: "Write a cached result",
  calculate_otp: "Calculate routing itineraries",
};
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const optionNames: Record<string, string> = {
  air: "Air quality",
  weather: "Weather",
  observation: "Published observation",
  hourly_forecast: "Hourly forecast",
  daily_forecast: "Daily forecast",
  warnings: "Weather warnings",
  event: "Observations with latest retained revision",
  knowledge: "Only evidence known at that instant",
  metro: "Metro",
  "light-rail": "Light rail",
  interurban: "Interurban buses",
  emt: "EMT buses",
  bicimad: "BiciMAD",
  renfe: "Renfe",
  crtm: "CRTM transport",
  TRANSIT: "Public transport",
  WALK: "Walking",
  BIKE: "Bike (unsupported)",
  CAR: "Car (unsupported)",
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
        Correct advanced JSON before continuing with the form.
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
        Load example without execution
      </Button>
      {Object.entries(properties).map(([key, raw]) => {
        const p = record(raw),
          type = p.type,
          options = Array.isArray(p.enum) ? p.enum : null,
          id = `argument-${key}`;
        if (key === "departureTime")
          return (
            <Field key={key}>
              <FieldLabel htmlFor={id}>Departure time</FieldLabel>
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
                  aria-label="Departure date and time, browser local time"
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
                Journey preferences
              </legend>
              {[
                ["maxWalkingMinutes", "Maximum walking minutes", 15, 120],
                ["maxTransfers", "Maximum transfers", 2, 6],
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
                  Wheelchair accessibility
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
                {labels[key] ?? "Travel modes"}
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
              {labels[key] ?? publicLabel(key)}: structured configuration in el
              apartado avanzado.
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
                  <option value="">Select a stored place</option>
                  {places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Up to 100 stored reference places. Search for a place or enter
                  a known ID in advanced configuration; no fabricated location.
                </p>
              </>
            ) : options && options.length <= 4 ? (
              <Segmented
                label={labels[key] ?? publicLabel(key)}
                value={String(value[key] ?? "")}
                onChange={(v) => update(key, v)}
                options={[
                  ["", "Default"],
                  ...options.map((o) => [o, optionNames[o] ?? o] as const),
                ]}
              />
            ) : options ? (
              <select
                id={id}
                value={String(value[key] ?? "")}
                onChange={(e) => update(key, e.target.value)}
                className="min-h-11 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Use default value</option>
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
