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
import { useUi } from "@/i18n/provider";
import { DashboardHttpError, useDashboard } from "@/src/dashboard-client";
import { primaryMeasurements } from "@/src/dashboard-presentation";
import { EntityDetail } from "./entity-detail";
import { EntityHistory } from "./entity-history";
import { sourceNames } from "./event-copy";
import { FreshnessBreakdown } from "./insights";
import { Card, Segmented, Sheet, Table } from "./primitives";
import { measurementDisplay } from "./product-copy";
import { Instant, PageTitle, publicLabel, State, Technical } from "./shared";

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
const freshnessTones: Record<string, string> = {
  recent: "neutral",
  recently_checked: "neutral",
  stale: "warning",
  unavailable: "muted",
  static: "muted",
  unknown: "muted",
};
export function Mobility({
  category: initialCategory,
  id,
}: {
  category?: string;
  id?: string;
}) {
  const { t, locale, copy } = useUi();

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
        title={
          id
            ? (entities[0]?.name ?? copy("Evidence detail"))
            : t("mobilityView.mobility")
        }
        description={t(
          "mobilityView.exploreStoredMeasurementsReferenceCatalogsAndTheirEvidence",
        )}
      />
      {!id ? (
        <div className="dc-toolbar">
          <Segmented
            label={t("mobilityView.evidenceFamily")}
            value={section}
            onChange={(v) => {
              setSection(v);
              setCategory(v === "reference" ? "places" : "bikes");
              setProduct(v === "reference" ? "reference:places" : "");
              setCursor(null);
              setSelected(null);
            }}
            options={[
              ["dynamic", t("mobilityView.dynamic")],
              ["reference", t("insights.reference")],
            ]}
          />
          {section === "dynamic" ? (
            <Segmented
              label={t("mobilityView.productFamily")}
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
          <FieldLabel htmlFor="reference-product">
            {t("mobilityView.referenceCatalog")}
          </FieldLabel>
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
              [
                "reference:places",
                t("mobilityView.placesStationsAndConnections"),
              ],
              ["reference:lines", t("mobilityView.publishedLines")],
              [
                "reference:timetables",
                t("mobilityView.publishedTimetablesCalendarRequired"),
              ],
              [
                "reference:accessibility",
                t("mobilityView.declaredStopAccessibility"),
              ],
              ["reference:tariffs", t("mobilityView.documentaryFares")],
              ["reference:geography", t("mobilityView.installedGeography")],
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
            {t("mobilityView.productAndEvidenceType")}
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
            <option value="">
              {t("mobilityView.allProductsInThisFamily")}
            </option>
            {(category === "environment"
              ? [
                  ["madrid-air", t("mobilityView.airObservations")],
                  ["aemet", t("mobilityView.weatherObservations")],
                  ["weather:forecast", t("mobilityView.hourlyForecast")],
                  ["weather:daily", t("mobilityView.dailyForecast")],
                ]
              : [
                  ["renfe-alerts", t("mobilityView.renfeAlerts")],
                  ["emt-alerts", t("mobilityView.emtAlerts")],
                  ["dgt-incidents", t("mobilityView.dgtIncidents")],
                  ["weather:warnings", t("mobilityView.weatherWarningsCap")],
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
          {t("mobilityView.revisionChangedReturnToFirstPage")}
        </Button>
      ) : null}
      {id ? (
        <Link
          className="text-sm underline"
          href={`/dashboard/mobility?${back}`}
        >
          {t("mobilityView.backToExplorer")}
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
            {t("mobilityView.searchEntity")}
          </label>
          <Input
            id="search"
            placeholder={t("mobilityView.searchEntities")}
            maxLength={100}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-64"
          />
          <Button type="submit" variant="outline">
            {t("mobilityView.search")}
          </Button>
          <Segmented
            label={t("mobilityView.freshness")}
            value={freshness}
            onChange={(v) => {
              setFreshness(v);
              setCursor(null);
              setSelected(null);
            }}
            options={[
              ["", t("activityView.all")],
              ["recent", t("map.recent")],
              ["stale", t("mobilityView.stale")],
              ["unavailable", t("activityView.unavailable")],
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
            title={t("mobilityView.mobilityFilters")}
            trigger={
              <Button variant="outline" type="button">
                {t("activityView.filters")}
                {source ? ` · ${source}` : ""}
              </Button>
            }
          >
            <Field>
              <FieldLabel htmlFor="source">
                {t("activityView.source")}
              </FieldLabel>
              <select
                id="source"
                value={draftSource}
                onChange={(e) => setDraftSource(e.target.value)}
              >
                <option value="">{t("mobilityView.allSources")}</option>
                {schemas.sourceIdSchema.options.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="all-freshness">
                {t("mobilityView.freshnessAllEvidenceStates")}
              </FieldLabel>
              <select
                id="all-freshness"
                value={draftFreshness}
                onChange={(e) => setDraftFreshness(e.target.value)}
              >
                <option value="">{t("mobilityView.allStates")}</option>
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
                {t("activityView.apply")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFiltersOpen(false)}
              >
                {t("activityView.cancel")}
              </Button>
            </div>
          </Sheet>
          <Segmented
            label={t("mobilityView.workspaceView")}
            value={map ? "map" : "list"}
            onChange={(v) => setMap(v === "map")}
            options={[
              ["list", t("mobilityView.list")],
              ["map", t("mobilityView.mapList")],
            ]}
          />
          <span className="dc-meta">
            {t(
              "mobilityView.listIncludesUnmappedEntitiesMapReadsAreIndependentlyViewport",
            )}
          </span>
        </form>
      )}
      {cursor ? (
        <p className="text-sm text-muted-foreground">
          {t(
            "mobilityView.historicalPageFreshnessRetainsItsEvaluationTimeReturnTo",
          )}
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
          {t(
            "mobilityView.thisFamilyContainsDifferentProductsSelectOneProductTo",
          )}
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
            <Table aria-label={t("mobilityView.mobilityEntities")}>
              <thead>
                <tr>
                  <th scope="col">{t("mobilityView.entityEvidence")}</th>
                  {category === "bikes" ? (
                    <>
                      <th scope="col" className="numeric">
                        {t("mobilityView.bikes")}
                      </th>
                      <th scope="col" className="numeric">
                        {t("mobilityView.docks")}
                      </th>
                    </>
                  ) : (
                    <th scope="col">{t("mobilityView.measurements")}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {entities.map((e) => (
                  <tr
                    key={`${e.evidence.productId}:${e.id}`}
                    data-freshness={e.evidence.freshness}
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
                      <p className="dc-meta dc-entity-evidence">
                        <span
                          className="dc-status"
                          data-tone={freshnessTones[e.evidence.freshness]}
                        >
                          {freshnessLabels[e.evidence.freshness]}
                        </span>
                        <span>
                          {copy(sourceNames[e.evidence.sourceId]) ??
                            e.evidence.sourceId}
                        </span>
                        <span>
                          {e.evidence.observedAt ? (
                            <>
                              {t("mobilityView.observed")}
                              <Instant value={e.evidence.observedAt} />
                            </>
                          ) : e.evidence.issuedAt ? (
                            <>
                              {t("mobilityView.issued")}
                              <Instant value={e.evidence.issuedAt} />
                            </>
                          ) : (
                            t("mobilityView.noObservationTime")
                          )}
                        </span>
                      </p>
                      {e.latitude === null ? (
                        <p className="dc-meta">
                          {t("mobilityView.noPublishedCoordinates")}
                        </p>
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
                            locale,
                          )}
                        </td>
                      ))
                    ) : (
                      <td>
                        {e.measurements.length ? (
                          primaryMeasurements(e).map((m) => (
                            <p key={m.name} className="text-sm">
                              {copy(publicLabel(m.name))}:{" "}
                              <strong>
                                {measurementDisplay(
                                  m.name,
                                  m.value,
                                  m.unit,
                                  locale,
                                )}
                              </strong>
                            </p>
                          ))
                        ) : (
                          <span className="dc-meta">
                            {t("mobilityView.noPublishedMeasurement")}
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
            {t("mobilityView.openLinkedDetail")}
          </Link>
        </Sheet>
      ) : null}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {entities.length} {t("mobilityView.rowsReturnedOnThisPage")}{" "}
          {page?.limited ? t("mobilityView.limitedResult") : ""}
        </span>
        <div className="flex gap-2">
          {cursor ? (
            <Button size="sm" variant="outline" onClick={() => setCursor(null)}>
              {t("mobilityView.firstPage")}
            </Button>
          ) : null}
          {page?.nextCursor ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCursor(page.nextCursor ?? null)}
            >
              {t("mobilityView.next")}
            </Button>
          ) : null}
        </div>
      </div>
      {id && entities[0] ? <EntityHistory entity={entities[0]} /> : null}
      {category === "parking" && parkingCategory ? (
        <p className="text-sm text-muted-foreground">
          {t("mobilityView.selectedParkingCategory")}
          {parkingCategory}. Only this category is shown.
        </p>
      ) : null}

      {id ? <Technical value={page} /> : null}
    </div>
  );
}
