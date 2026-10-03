"use client";
import type { DashboardEntity } from "@mobility/contracts";
import * as schemas from "@mobility/contracts";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DashboardHttpError, useDashboard } from "@/src/dashboard-client";
import { primaryMeasurements } from "@/src/dashboard-presentation";
import { EntityDetail } from "./entity-detail";
import { EntityHistory } from "./entity-history";
import { FreshnessBreakdown } from "./insights";
import { Card, Segmented, Sheet, Table } from "./primitives";
import { measurementDisplay } from "./product-copy";
import { PageTitle, publicLabel, State, Technical } from "./shared";

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
const MapView = dynamic(() => import("./map"), { ssr: false });
const categories = [
  ["places", "Places and transport"],
  ["departures", "Departures and arrivals"],
  ["incidents", "Incidents"],
  ["bikes", "BiciMAD"],
  ["environment", "Air and weather"],
  ["traffic", "Traffic"],
  ["parking", "Parking"],
];
const freshnessLabels: Record<string, string> = {
  recent: "Recent",
  recently_checked: "Recently checked",
  stale: "Stale",
  unavailable: "Unavailable",
  static: "Published reference",
  unknown: "Age unknown",
};
export function Mobility({
  category: initialCategory,
  id,
}: {
  category?: string;
  id?: string;
}) {
  const [section, setSection] = useState(
    initialCategory === "places" ? "reference" : "dynamic",
  );
  const [product, setProduct] = useState("");
  const [returnView, setReturnView] = useState("");
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const view = new URLSearchParams();
      for (const key of [
        "map",
        "center",
        "zoom",
        "returnProduct",
        "returnCursor",
      ])
        if (params.has(key)) view.set(key, params.get(key) ?? "");
      setReturnView(view.toString());
      if (!id)
        setMap(
          params.get("map") === "1" ||
            (!params.has("map") &&
              window.matchMedia("(min-width:1100px)").matches),
        );
      const cat = schemas.dashboardCategory.safeParse(params.get("category"));
      if (cat.success && !initialCategory) setCategory(cat.data);
      if (params.get("section") === "reference") {
        setSection("reference");
        setProduct(params.get("product") ?? "reference:places");
        if (!initialCategory) setCategory("places");
      }
      setSource("");
      setFreshness("");
      setProduct(
        params.get("section") === "reference" ? "reference:places" : "",
      );
      setSearch("");
      setFilter("");
      setCursor(null);
      if (params.get("parkingCategory"))
        setParkingCategory(params.get("parkingCategory") ?? "");
      if (params.get("product")) setProduct(params.get("product") ?? "");
      if (schemas.sourceIdSchema.safeParse(params.get("source")).success)
        setSource(params.get("source") ?? "");
      if (schemas.dashboardFreshness.safeParse(params.get("freshness")).success)
        setFreshness(params.get("freshness") ?? "");
      if (!id && params.get("cursor")) setCursor(params.get("cursor"));
      if (params.get("search")) {
        setSearch(params.get("search") ?? "");
        setFilter(params.get("search") ?? "");
      }
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [initialCategory, id]);
  const [category, setCategory] = useState(initialCategory ?? "bikes"),
    [parkingCategory, setParkingCategory] = useState(""),
    [source, setSource] = useState(""),
    [freshness, setFreshness] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [cursor, setCursor] = useState<string | null>(null),
    [map, setMap] = useState(false);
  const [selected, setSelected] = useState<DashboardEntity | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftSource, setDraftSource] = useState(source);
  const [draftFreshness, setDraftFreshness] = useState(freshness);
  const qs = new URLSearchParams({
    category,
    section,
    ...(product ? { product } : {}),
    ...(category === "parking" && parkingCategory ? { parkingCategory } : {}),
    ...(source ? { source } : {}),
    ...(freshness ? { freshness } : {}),
    ...(filter ? { search: filter } : {}),
    ...(cursor ? { cursor } : {}),
  });
  const q = useDashboard(
    id
      ? `entities/${category}/${encodeURIComponent(id)}?${qs}`
      : `entities?${qs}`,
    cursor || section === "reference" ? 0 : 15000,
    true,
  );
  const page = (id ? unwrap(q.data) : q.data) as
    | {
        entities?: DashboardEntity[];
        nextCursor?: string;
        limited?: boolean;
        totals?: z.infer<typeof schemas.dashboardSelectionTotals>;
      }
    | undefined;
  const queryString = qs.toString();
  useEffect(() => {
    if (!id) {
      const next = new URLSearchParams(queryString),
        existing = new URLSearchParams(window.location.search);
      next.set("map", map ? "1" : "0");
      for (const key of ["center", "zoom"])
        if (existing.has(key)) next.set(key, existing.get(key) ?? "");
      window.history.replaceState(
        window.history.state,
        "",
        `/dashboard/mobility?${next}`,
      );
    }
  }, [id, queryString, map]);

  const previousSelection = useRef(queryString);
  useEffect(() => {
    if (previousSelection.current !== queryString) {
      previousSelection.current = queryString;
      setSelected(null);
    }
  }, [queryString]);
  const entities = page?.entities ?? [];
  const back = new URLSearchParams(`${qs}&${returnView}`);
  if (back.has("returnProduct")) {
    const p = back.get("returnProduct");
    back.delete("product");
    if (p) back.set("product", p);
  }
  if (back.get("returnCursor"))
    back.set("cursor", back.get("returnCursor") ?? "");
  back.delete("returnProduct");
  back.delete("returnCursor");
  const detailParameters = (entityProduct: string) => {
    const next = new URLSearchParams(qs);
    next.delete("cursor");
    next.set("product", entityProduct);
    next.set("returnProduct", product);
    if (cursor) next.set("returnCursor", cursor);
    const view = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    );
    for (const key of ["map", "center", "zoom"])
      if (view.has(key)) next.set(key, view.get(key) ?? "");
    return next;
  };
  return (
    <div className="dc-mobility-view">
      <PageTitle
        title={id ? (entities[0]?.name ?? "Evidence detail") : "Mobility"}
        description="Explore stored measurements, reference catalogs and their evidence."
      />
      {!id ? (
        <div className="dc-toolbar">
          <Segmented
            label="Evidence family"
            value={section}
            onChange={(v) => {
              setSection(v);
              setCategory(v === "reference" ? "places" : "bikes");
              setProduct(v === "reference" ? "reference:places" : "");
              setCursor(null);
              setSelected(null);
            }}
            options={[
              ["dynamic", "Dynamic"],
              ["reference", "Reference"],
            ]}
          />
          {section === "dynamic" ? (
            <Segmented
              label="Product family"
              value={category}
              onChange={(v) => {
                setCategory(v);
                setProduct("");
                setCursor(null);
                setSelected(null);
              }}
              options={categories
                .filter(([v]) => v !== "places")
                .map(([v, l]) => [v ?? "", l ?? ""])}
            />
          ) : null}
        </div>
      ) : null}
      {!id && section === "reference" ? (
        <Field className="max-w-md">
          <FieldLabel htmlFor="reference-product">Reference catalog</FieldLabel>
          <select
            id="reference-product"
            value={product || "reference:places"}
            onChange={(e) => {
              setProduct(e.target.value);
              setCursor(null);
            }}
            className="min-h-11 rounded-md border bg-background px-3 text-sm"
          >
            {[
              ["reference:places", "Places, stations and connections"],
              ["reference:lines", "Published lines"],
              [
                "reference:timetables",
                "Published timetables (calendar required)",
              ],
              ["reference:accessibility", "Declared stop accessibility"],
              ["reference:tariffs", "Documentary fares"],
              ["reference:geography", "Installed geography"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {!id &&
      section === "dynamic" &&
      ["environment", "incidents"].includes(category) ? (
        <Field className="max-w-md">
          <FieldLabel htmlFor="dynamic-product">
            Product and evidence type
          </FieldLabel>
          <select
            id="dynamic-product"
            value={product}
            onChange={(e) => {
              setProduct(e.target.value);
              setCursor(null);
            }}
            className="min-h-11 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">All products in this family</option>
            {(category === "environment"
              ? [
                  ["madrid-air", "Air observations"],
                  ["aemet", "Weather observations"],
                  ["weather:forecast", "Hourly forecast"],
                  ["weather:daily", "Daily forecast"],
                ]
              : [
                  ["renfe-alerts", "Renfe alerts"],
                  ["emt-alerts", "EMT alerts"],
                  ["dgt-incidents", "DGT incidents"],
                  ["weather:warnings", "Weather warnings CAP"],
                ]
            ).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {q.error instanceof DashboardHttpError && q.error.status === 409 ? (
        <Button variant="outline" onClick={() => setCursor(null)}>
          Revision changed. Return to first page
        </Button>
      ) : null}
      {id ? (
        <Link
          className="text-sm underline"
          href={`/dashboard/mobility?${back}`}
        >
          Back to explorer
        </Link>
      ) : (
        <form
          className="dc-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setCursor(null);
            setFilter(search);
            setSelected(null);
          }}
        >
          <label className="sr-only" htmlFor="search">
            Search entity
          </label>
          <Input
            id="search"
            placeholder="Search entities"
            maxLength={100}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-64"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
          <Segmented
            label="Freshness"
            value={freshness}
            onChange={(v) => {
              setFreshness(v);
              setCursor(null);
              setSelected(null);
            }}
            options={[
              ["", "All"],
              ["recent", "Recent"],
              ["stale", "Stale"],
              ["unavailable", "Unavailable"],
            ]}
          />
          <Sheet
            open={filtersOpen}
            onOpenChange={(v) => {
              setFiltersOpen(v);
              if (v) {
                setDraftSource(source);
                setDraftFreshness(freshness);
              }
            }}
            title="Mobility filters"
            trigger={
              <Button variant="outline" type="button">
                Filters{source ? ` · ${source}` : ""}
              </Button>
            }
          >
            <Field>
              <FieldLabel htmlFor="source">Source</FieldLabel>
              <select
                id="source"
                value={draftSource}
                onChange={(e) => setDraftSource(e.target.value)}
              >
                <option value="">All sources</option>
                {schemas.sourceIdSchema.options.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="all-freshness">
                Freshness (all evidence states)
              </FieldLabel>
              <select
                id="all-freshness"
                value={draftFreshness}
                onChange={(e) => setDraftFreshness(e.target.value)}
              >
                <option value="">All states</option>
                {Object.entries(freshnessLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="dc-filter-footer">
              <Button
                type="button"
                onClick={() => {
                  setSource(draftSource);
                  setFreshness(draftFreshness);
                  setCursor(null);
                  setSelected(null);
                  setFiltersOpen(false);
                }}
              >
                Apply
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFiltersOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </Sheet>
          <Segmented
            label="Workspace view"
            value={map ? "map" : "list"}
            onChange={(v) => setMap(v === "map")}
            options={[
              ["list", "List"],
              ["map", "Map + list"],
            ]}
          />
          <span className="dc-meta">
            List includes unmapped entities. Map reads are independently
            viewport-scoped.
          </span>
        </form>
      )}
      {cursor ? (
        <p className="text-sm text-muted-foreground">
          Historical page: freshness retains its evaluation time. Return to the
          first page for the current selection.
        </p>
      ) : null}
      <State
        data={q.data}
        loading={q.isLoading}
        error={q.error}
        empty={!entities.length}
      />
      {page?.totals &&
      (product || ["bikes", "traffic", "parking"].includes(category)) ? (
        <FreshnessBreakdown {...page.totals} />
      ) : page?.totals ? (
        <p className="text-sm text-muted-foreground">
          This family contains different products. Select one product to see age
          coverage without mixing units.
        </p>
      ) : null}

      <div className="dc-workspace" data-view={map ? "split" : "list"}>
        {map ? (
          <Card className="dc-map-stage">
            <MapView
              category={category}
              section={section}
              product={product}
              parkingCategory={parkingCategory}
              source={source}
              freshness={freshness}
              search={filter}
              onViewChange={setReturnView}
              selectedKey={
                selected
                  ? `${selected.evidence.productId}:${selected.id}`
                  : undefined
              }
              onSelect={(e) => {
                setSelected(e);
                setDetailOpen(true);
              }}
            />
          </Card>
        ) : null}
        {id && entities[0] ? <EntityDetail entity={entities[0]} /> : null}
        {!id && entities.length ? (
          <Card className="dc-list-stage">
            <Table>
              <thead>
                <tr>
                  <th>Entity / evidence</th>
                  {category === "bikes" ? (
                    <>
                      <th>Bikes</th>
                      <th>Docks</th>
                    </>
                  ) : (
                    <th>Measurements</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {entities.map((e) => (
                  <tr
                    key={`${e.evidence.productId}:${e.id}`}
                    aria-selected={
                      selected?.id === e.id &&
                      selected.evidence.productId === e.evidence.productId
                    }
                  >
                    <td>
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        onClick={() => {
                          setSelected(e);
                          setDetailOpen(true);
                        }}
                      >
                        {e.name}
                      </button>
                      <p className="dc-meta">
                        {freshnessLabels[e.evidence.freshness]} ·{" "}
                        {e.evidence.sourceId}
                      </p>
                      {e.latitude === null ? (
                        <p className="dc-meta">No published coordinates</p>
                      ) : null}
                    </td>
                    {category === "bikes" ? (
                      ["bikes", "docks"].map((key) => (
                        <td key={key} className="numeric">
                          {measurementDisplay(
                            key,
                            e.measurements.find((m) => m.name === key)?.value ??
                              null,
                            null,
                          )}
                        </td>
                      ))
                    ) : (
                      <td>
                        {e.measurements.length ? (
                          primaryMeasurements(e).map((m) => (
                            <p key={m.name} className="text-sm">
                              {publicLabel(m.name)}:{" "}
                              <strong>
                                {measurementDisplay(m.name, m.value, m.unit)}
                              </strong>
                            </p>
                          ))
                        ) : (
                          <span className="dc-meta">
                            No published measurement
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : null}
      </div>
      {selected ? (
        <Sheet
          open={detailOpen}
          onOpenChange={setDetailOpen}
          title={selected.name}
        >
          <EntityDetail entity={selected} />
          <EntityHistory entity={selected} />
          <Link
            className="dc-link"
            href={`/dashboard/mobility/${category}/${encodeURIComponent(selected.id)}?${detailParameters(selected.evidence.productId)}`}
          >
            Open linked detail
          </Link>
        </Sheet>
      ) : null}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {entities.length} rows returned on this page{" "}
          {page?.limited ? "· limited result" : ""}
        </span>
        <div className="flex gap-2">
          {cursor ? (
            <Button size="sm" variant="outline" onClick={() => setCursor(null)}>
              First page
            </Button>
          ) : null}
          {page?.nextCursor ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCursor(page.nextCursor ?? null)}
            >
              Next
            </Button>
          ) : null}
        </div>
      </div>
      {id && entities[0] ? <EntityHistory entity={entities[0]} /> : null}
      {category === "parking" && parkingCategory ? (
        <p className="text-sm text-muted-foreground">
          Selected parking category: {parkingCategory}. Only this category is
          shown.
        </p>
      ) : null}

      {id ? <Technical value={page} /> : null}
    </div>
  );
}
