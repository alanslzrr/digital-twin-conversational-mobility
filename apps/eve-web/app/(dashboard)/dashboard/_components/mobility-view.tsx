"use client";
import type { DashboardEntity } from "@mobility/contracts";
import * as schemas from "@mobility/contracts";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Tabs } from "radix-ui";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DashboardHttpError, useDashboard } from "@/src/dashboard-client";
import { EntityDetail } from "./entity-detail";
import { EntityHistory } from "./entity-history";
import { FreshnessBreakdown, number } from "./insights";
import {
  evidenceExplanation,
  measurementValue,
  productLabel,
} from "./product-copy";
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
  static: "Referencia publicada",
  unknown: "Antigüedad no confirmada",
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
    if (!id && params.get("map") === "1") setMap(true);
    const cat = schemas.dashboardCategory.safeParse(params.get("category"));
    if (cat.success && !initialCategory) setCategory(cat.data);
    if (params.get("section") === "reference") {
      setSection("reference");
      setProduct(params.get("product") ?? "reference:places");
      if (!initialCategory) setCategory("places");
    }
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
  }, [initialCategory, id]);
  const [category, setCategory] = useState(initialCategory ?? "bikes"),
    [source, setSource] = useState(""),
    [freshness, setFreshness] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [cursor, setCursor] = useState<string | null>(null),
    [map, setMap] = useState(false);
  const qs = new URLSearchParams({
    category,
    section,
    ...(product ? { product } : {}),
    ...(source ? { source } : {}),
    ...(freshness ? { freshness } : {}),
    ...(filter ? { search: filter } : {}),
    ...(cursor ? { cursor } : {}),
  });
  const q = useDashboard(
    id
      ? `entities/${category}/${encodeURIComponent(id)}?${qs}`
      : `entities?${qs}`,
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
      if (map) next.set("map", "1");
      for (const key of ["center", "zoom"])
        if (existing.has(key)) next.set(key, existing.get(key) ?? "");
      window.history.replaceState(null, "", `/dashboard/mobility?${next}`);
    }
  }, [id, queryString, map]);
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
    <>
      <PageTitle
        title={
          id ? (entities[0]?.name ?? "Detalle de información") : "Movilidad"
        }
        description="Observación, incorporación y lectura son instantes distintos. Los catálogos no son tiempo real; cero no significa ausencia."
      />
      {!id ? (
        <Tabs.Root
          value={section}
          onValueChange={(value) => {
            setSection(value);
            setCategory(value === "reference" ? "places" : "bikes");
            setProduct(value === "reference" ? "reference:places" : "");
            setCursor(null);
          }}
        >
          <Tabs.List aria-label="Tipo de información" className="flex gap-2">
            <Tabs.Trigger
              value="dynamic"
              className="min-h-11 rounded-md px-4 text-sm data-[state=active]:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              Datos que cambian
            </Tabs.Trigger>
            <Tabs.Trigger
              value="reference"
              className="min-h-11 rounded-md px-4 text-sm data-[state=active]:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              Catálogos de referencia
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content
            value="dynamic"
            className="mt-2 text-sm text-muted-foreground"
          >
            Lecturas, estimaciones, predicciones y avisos: cada producto
            conserva sus fechas y límites.
          </Tabs.Content>
          <Tabs.Content
            value="reference"
            className="mt-2 text-sm text-muted-foreground"
          >
            Información de referencia versionada; no es disponibilidad en
            directo.
          </Tabs.Content>
        </Tabs.Root>
      ) : null}
      {!id && section === "reference" ? (
        <Field className="max-w-md">
          <FieldLabel htmlFor="reference-product">
            Catálogo de referencia
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
              ["reference:places", "Lugares, estaciones y correspondencias"],
              ["reference:lines", "Líneas publicadas"],
              [
                "reference:timetables",
                "Horarios publicados (requieren calendario)",
              ],
              ["reference:accessibility", "Accesibilidad declarada de paradas"],
              ["reference:tariffs", "Tarifas documentales"],
              ["reference:geography", "Geografía instalada"],
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
            Producto y tipo de dato
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
            <option value="">Todos los productos de esta categoría</option>
            {(category === "environment"
              ? [
                  ["madrid-air", "Observaciones de aire"],
                  ["aemet", "Observaciones meteorológicas"],
                  ["weather:forecast", "Predicción horaria"],
                  ["weather:daily", "Predicción diaria"],
                ]
              : [
                  ["renfe-alerts", "Avisos Renfe"],
                  ["emt-alerts", "Avisos EMT"],
                  ["dgt-incidents", "Incidencias DGT"],
                  ["weather:warnings", "Avisos meteorológicos CAP"],
                ]
            ).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {page?.totals &&
      (product || ["bikes", "traffic", "parking"].includes(category)) ? (
        <FreshnessBreakdown {...page.totals} />
      ) : page?.totals ? (
        <p className="text-sm text-muted-foreground">
          Esta categoría reúne productos distintos. Selecciona un producto para
          ver su distribución de antigüedad sin mezclar unidades.
        </p>
      ) : null}
      {q.error instanceof DashboardHttpError && q.error.status === 409 ? (
        <Button variant="outline" onClick={() => setCursor(null)}>
          Hay una nueva versión. Volver a la primera página
        </Button>
      ) : null}
      {id ? (
        <Link
          className="text-sm underline"
          href={`/dashboard/mobility?${back}`}
        >
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
                className="min-h-11 rounded-md border bg-background px-3 text-sm"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setProduct("");
                  setCursor(null);
                }}
              >
                {categories
                  .filter(([v]) =>
                    section === "reference" ? v === "places" : v !== "places",
                  )
                  .map(([v, l]) => (
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
                className="min-h-11 rounded-md border bg-background px-3 text-sm"
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
                className="min-h-11 rounded-md border bg-background px-3 text-sm"
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
          section={section}
          product={product}
          source={source}
          freshness={freshness}
          search={filter}
          onSelect={(id, product) => {
            window.location.href = `/dashboard/mobility/${category}/${encodeURIComponent(id)}?${detailParameters(product)}`;
          }}
        />
      ) : null}
      {id && entities[0] ? <EntityDetail entity={entities[0]} /> : null}
      {!id && entities.length ? (
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
                  key={`${productLabel(e.evidence.productId)}:${e.id}`}
                  className="border-b last:border-b-0"
                >
                  <td className="p-3">
                    <Link
                      className="font-medium underline-offset-4 hover:underline"
                      href={`/dashboard/mobility/${category}/${encodeURIComponent(e.id)}?${detailParameters(e.evidence.productId)}`}
                    >
                      {e.name}
                    </Link>
                    {e.kind === "catalog" &&
                    e.evidence.validTo &&
                    Date.parse(e.evidence.validTo) < Date.now() ? (
                      <p className="mt-1 text-xs font-medium">
                        Horario fuera de vigencia; el catálogo sigue siendo
                        consultable.
                      </p>
                    ) : null}
                    {e.latitude === null ? (
                      <p className="text-xs text-muted-foreground">
                        Sin coordenadas publicadas
                      </p>
                    ) : null}
                  </td>
                  <td className="p-3 text-xs">
                    {productLabel(e.evidence.productId)}
                    <br />
                    {e.evidence.sourceId}
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">
                      {freshnessLabels[e.evidence.freshness]}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {evidenceExplanation(
                        e.evidence.reason,
                        e.evidence.coverage,
                      )}
                    </p>
                  </td>
                  <td className="p-3 text-xs">
                    {e.kind === "forecast" ? (
                      <>
                        <span>Predicción para </span>
                        <Instant value={e.evidence.validFrom} />
                        <br />
                        <span>Publicada: </span>
                        {e.evidence.issuedAt ? (
                          <Instant value={e.evidence.issuedAt} />
                        ) : (
                          (e.evidence.issuedAtRaw ??
                          "Antigüedad de publicación no confirmada")
                        )}
                      </>
                    ) : e.kind === "catalog" ? (
                      <>
                        Vigencia: <Instant value={e.evidence.validTo} />
                      </>
                    ) : (
                      <Instant value={e.evidence.observedAt} />
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    <Instant value={e.evidence.ingestedAt} />
                  </td>
                  <td className="p-3 text-xs">
                    {e.measurements.length
                      ? e.measurements.map((m) => (
                          <div key={m.name}>
                            {publicLabel(m.name)}:{" "}
                            {m.value === null
                              ? "No disponible"
                              : typeof m.value === "number"
                                ? number(m.value)
                                : typeof m.value === "boolean"
                                  ? m.value
                                    ? "Sí"
                                    : "No"
                                  : measurementValue(m.name, m.value)}{" "}
                            {m.unit}
                            {m.basis === "interval"
                              ? ` · acumulada o agregada durante ${m.periodMinutes ?? "su periodo"} min`
                              : m.basis === "instant"
                                ? " · instantánea"
                                : ""}
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
      {id && entities[0] ? <EntityHistory entity={entities[0]} /> : null}
      {id ? <Technical value={page} /> : null}
    </>
  );
}
