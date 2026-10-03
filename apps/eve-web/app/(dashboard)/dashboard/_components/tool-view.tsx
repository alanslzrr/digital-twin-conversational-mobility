"use client";
import type { dashboardToolCatalog } from "@mobility/contracts";
import * as schemas from "@mobility/contracts";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDashboard, useDashboardContext } from "@/src/dashboard-client";
import { unresolvedExecution } from "@/src/dashboard-presentation";
import { InspectionResult } from "./inspection-result";
import { Card, Segmented } from "./primitives";
import { RefinedDisclosure } from "./refinement/RefinedDisclosure";
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
export function Tools({ name: routeName }: { name?: string }) {
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("stored");
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const ctx = useDashboardContext();
  const q = useDashboard("tools", 0, true);
  const tools = (q.data as { tools?: Tool[] })?.tools ?? [];
  const name = routeName ?? tools[0]?.name;
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
    const recovery = name ? ctx.executionRecovery.get(name) : undefined;
    requestId.current = recovery?.requestId ?? null;
    setUnknownOutcome(recovery?.unresolved ?? false);
    setMode("stored");
  }, [name, ctx.executionRecovery]);
  const tool = tools.find((t) => t.name === name);
  const submit = async (execute: boolean) => {
    if (
      !tool ||
      (execute &&
        (unknownOutcome || ctx.executionRecovery.get(tool.name)?.unresolved))
    )
      return;
    const selected = name;
    setPending(true);
    setError("");
    try {
      const checked = toolInputs[tool.name].safeParse(JSON.parse(input));
      if (!checked.success)
        throw new Error(
          "Check required fields and allowed values before submitting.",
        );
      const parsed = checked.data;
      if (new TextEncoder().encode(input).length > 8192)
        throw new Error("Maximum 8,192 argument bytes");
      if (execute) {
        requestId.current = crypto.randomUUID();
        ctx.executionRecovery.set(tool.name, {
          requestId: requestId.current,
          unresolved: true,
        });
      }
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
      if (selection.current === selected) {
        setResult(unwrap(response));
        if (execute && requestId.current) {
          const unresolved = unresolvedExecution(unwrap(response));
          setUnknownOutcome(unresolved);
          ctx.executionRecovery.set(tool.name, {
            requestId: requestId.current,
            unresolved,
          });
        }
      }
    } catch (e) {
      if (execute && requestId.current && selection.current === selected)
        setUnknownOutcome(true);
      if (selection.current === selected)
        setError(e instanceof Error ? e.message : "Unavailable");
    } finally {
      if (selection.current === selected) setPending(false);
    }
  };
  return (
    <>
      <PageTitle
        title="Queries"
        description="Discover registered tools. Inspection and execution stay separate."
      />
      <State data={q.data} loading={q.isLoading} error={q.error} />
      <div className="dc-inspector-layout">
        <Card>
          <label htmlFor="tool-search" className="sr-only">
            Search registered tools
          </label>
          <Input
            id="tool-search"
            placeholder="Search 16 registered tools"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="dc-catalog">
            {Object.entries({
              Places: ["resolve_place", "resolve_address"],
              "Journeys and timetables": [
                "plan_journey",
                "get_departures",
                "get_emt_arrivals",
                "get_crtm_timetable",
              ],
              "Mobility evidence": [
                "get_incidents",
                "get_bike_availability",
                "get_environment",
                "get_road_state",
                "get_parking",
                "get_historical_state",
              ],
              "System and coverage": [
                "get_source_health",
                "get_line_status",
                "get_network_status",
                "get_mobility_snapshot",
              ],
            }).map(([group, names]) => {
              const matching = tools.filter(
                (t) =>
                  names.includes(t.name) &&
                  `${t.name} ${toolCopy[t.name].title} ${toolCopy[t.name].question}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              );
              return matching.length ? (
                <div key={group}>
                  <h2 className="dc-group-title">{group}</h2>
                  {matching.map((t) => (
                    <Link
                      key={t.name}
                      href={`/dashboard/tools/${t.name}`}
                      className="dc-tool-row"
                      aria-current={name === t.name ? "page" : undefined}
                    >
                      <strong>{toolCopy[t.name].title}</strong>
                      <p>{t.name}</p>
                    </Link>
                  ))}
                </div>
              ) : null;
            })}
          </div>
        </Card>
        <div className="dc-stack">
          {tool ? (
            <>
              <Link href="/dashboard/tools" className="text-sm underline">
                Back to catalog
              </Link>
              <p className="text-sm leading-6 text-muted-foreground">
                {toolCopy[tool.name].question}
              </p>
              <Technical value={JSON.parse(tool.inputSchemaJson)} />
              <form
                className="dc-card dc-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(mode === "run");
                }}
              >
                <Segmented
                  label="Query mode"
                  value={mode}
                  onChange={(v) => {
                    setMode(v);
                    setConfirmed(false);
                  }}
                  options={[
                    ["stored", "Stored evidence"],
                    ["run", "Run query"],
                  ]}
                />
                <p className="dc-meta">
                  {mode === "stored"
                    ? "Read stored evidence without executing this tool."
                    : `Explicit execution. Possible effects: ${tool.possibleEffects.map((effect) => effectCopy[effect]).join(" · ") || "stored access only"}`}
                </p>
                <ToolFields
                  name={tool.name}
                  schema={tool.inputSchemaJson}
                  input={input}
                  onChange={setInput}
                />
                <FieldGroup>
                  <RefinedDisclosure title="Advanced configuration">
                    <Field>
                      <FieldLabel htmlFor="tool-input">
                        Advanced JSON · maximum 8,192 bytes
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
                  </RefinedDisclosure>
                  {mode === "run" ? (
                    <Field>
                      <FieldLabel>
                        <input
                          type="checkbox"
                          checked={confirmed}
                          onChange={(e) => setConfirmed(e.target.checked)}
                        />{" "}
                        I confirm explicit execution and its declared effects
                      </FieldLabel>
                      <p className="text-xs text-muted-foreground">
                        One execution reservation per evaluator, six
                        executions/minute and sixty/day. Address lookup still
                        requires specific allowExternal consent.
                      </p>
                    </Field>
                  ) : null}
                </FieldGroup>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    variant={mode === "stored" ? "outline" : "default"}
                    disabled={
                      pending ||
                      (mode === "run" && (!confirmed || unknownOutcome))
                    }
                  >
                    {mode === "stored"
                      ? "Inspect stored evidence"
                      : "Run query"}
                  </Button>
                  {unknownOutcome ? (
                    <p role="alert">
                      Execution outcome unknown. Recover this request by ID
                      before another execution. Cancelling the screen does not
                      cancel the provider.
                    </p>
                  ) : null}
                  {requestId.current ? (
                    <p className="dc-meta break-all">
                      Request ID: {requestId.current}
                    </p>
                  ) : null}
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
                          const unresolved = unresolvedExecution(
                            unwrap(response),
                          );
                          setUnknownOutcome(unresolved);
                          if (requestId.current)
                            ctx.executionRecovery.set(tool.name, {
                              requestId: requestId.current,
                              unresolved,
                            });
                        } catch {
                          if (selection.current === selected)
                            setError(
                              "Could not recover the result. No re-execution occurred.",
                            );
                        }
                      }}
                    >
                      Recover status by request ID
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
                    onClick={() => ctx.cancelPending()}
                  >
                    Cancel request
                  </Button>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Inspector limit: 256 KB. EVE context: 32 KB. Inspector
                  evidence does not certify what the model received.
                </p>
                {pending ? (
                  <p role="status" className="text-sm">
                    Request in progress. Cancelling the screen does not prove
                    provider cancellation.
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
            <Card>
              <h2>{name ? "Tool not registered" : "Select a query"}</h2>
              <p className="dc-meta mt-2">
                Explore its inputs and stored evidence before choosing explicit
                execution.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
