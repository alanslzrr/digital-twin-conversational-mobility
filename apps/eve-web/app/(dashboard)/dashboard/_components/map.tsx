"use client";
import { useUi } from "@/i18n/provider";

import "leaflet/dist/leaflet.css";
import type { DashboardEntity } from "@mobility/contracts";
import type { CircleMarker, LayerGroup, Map as LeafletMap } from "leaflet";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { useDashboard } from "@/src/dashboard-client";
import { sourceNames } from "./event-copy";
import { measurementDisplay, productLabel } from "./product-copy";
import { Instant, State } from "./shared";
export default function MobilityMap({
  category,
  section,
  product,
  parkingCategory,
  source,
  freshness,
  search,
  onSelect,
  selectedKey,
  onViewChange,
}: {
  category: string;
  section: string;
  product: string;
  parkingCategory: string;
  source: string;
  freshness: string;
  search: string;
  selectedKey?: string | undefined;
  onSelect: (entity: DashboardEntity) => void;
  onViewChange: (view: string) => void;
}) {
  const { t, locale, copy, numberLocale } = useUi();

  const host = useRef<HTMLDivElement>(null),
    map = useRef<LeafletMap | null>(null),
    layer = useRef<LayerGroup | null>(null);
  const markers = useRef(new Map<string, CircleMarker>());
  const { resolvedTheme } = useTheme();
  const [bbox, setBbox] = useState("-3.9,40.25,-3.5,40.6"),
    [tileError, setTileError] = useState(false),
    [ready, setReady] = useState(false);
  const query = new URLSearchParams({
    category,
    section,
    ...(product ? { product } : {}),
    ...(category === "parking" && parkingCategory ? { parkingCategory } : {}),
    bbox,
    ...(search ? { search } : {}),
    ...(source ? { source } : {}),
    ...(freshness ? { freshness } : {}),
  });
  const { data, error, isLoading } = useDashboard(
    `map?${query}`,
    section === "reference" ? 0 : 15000,
  );
  const features = data as
    | { entities: DashboardEntity[]; limited: boolean; readAt: string }
    | undefined;
  const select = useRef(onSelect);
  select.current = onSelect;
  const viewChanged = useRef(onViewChange);
  viewChanged.current = onViewChange;
  useEffect(() => {
    let removed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void import("leaflet").then((L) => {
      if (removed || !host.current) return;
      const view = new URLSearchParams(window.location.search);
      const center = (view.get("center") ?? "").split(",").map(Number),
        zoom = Number(view.get("zoom"));
      const valid =
        center.length === 2 &&
        center.every(Number.isFinite) &&
        Math.abs(center[0] ?? 100) <= 90 &&
        Math.abs(center[1] ?? 200) <= 180;
      const m = L.map(host.current, {
        preferCanvas: true,
        zoomControl: false,
      }).setView(
        valid ? [center[0] as number, center[1] as number] : [40.4168, -3.7038],
        zoom >= 5 && zoom <= 19 ? zoom : 12,
      );
      L.control.zoom().addTo(m);
      map.current = m;
      layer.current = L.layerGroup().addTo(m);
      setReady(true);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        crossOrigin: "anonymous",
        referrerPolicy: "origin",
        maxZoom: 19,
        noWrap: true,
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 0,
      })
        .on("tileerror", () => setTileError(true))
        .addTo(m);
      const move = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (window.location.pathname !== "/dashboard/mobility") return;
          const view = new URLSearchParams(window.location.search),
            center = m.getCenter();
          view.set("map", "1");
          view.set(
            "center",
            `${center.lat.toFixed(6)},${center.lng.toFixed(6)}`,
          );
          view.set("zoom", String(m.getZoom()));
          window.history.replaceState(
            window.history.state,
            "",
            `/dashboard/mobility?${view}`,
          );
          viewChanged.current(
            new URLSearchParams({
              map: "1",
              center: view.get("center") ?? "",
              zoom: view.get("zoom") ?? "",
            }).toString(),
          );
          const b = m.getBounds();
          setBbox(
            [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(","),
          );
        }, 300);
      };
      m.on("moveend zoomend", move);
      move();
    });
    return () => {
      removed = true;
      clearTimeout(timer);
      map.current?.remove();
      map.current = null;
      markers.current.clear();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    // Update owned Leaflet controls without recreating the map or its viewport.
    for (const [selector, label] of [
      [".leaflet-control-zoom-in", t("map.zoomIn")],
      [".leaflet-control-zoom-out", t("map.zoomOut")],
    ]) {
      const button = host.current?.querySelector(selector!);
      button?.setAttribute("title", label!);
      button?.setAttribute("aria-label", label!);
    }
  }, [ready, t]);
  useEffect(() => {
    // Marker colors resolve the theme tokens, so they must be recomputed per theme.
    if (!ready || !resolvedTheme) return;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !layer.current) return;
      const retained = new Set<string>();
      const colors = {
        recent: "var(--dash-series)",
        recently_checked: "var(--dash-series)",
        stale: "var(--dash-warning-mark)",
        unavailable: "var(--dash-muted)",
        static: "var(--dash-secondary)",
        unknown: "var(--dash-muted)",
      };
      const labels = {
        recent: t("map.recentReading"),
        recently_checked: t("map.forecastChecked"),
        stale: t("insights.staleEvidence"),
        unavailable: t("insights.noUsableEvidence"),
        static: t("insights.reference"),
        unknown: t("map.ageUnknown"),
      };
      for (const entity of features?.entities ?? []) {
        if (entity.latitude === null || entity.longitude === null) continue;
        const key = `${entity.evidence.productId}:${entity.id}`;
        retained.add(key);
        let marker = markers.current.get(key);
        if (!marker) {
          marker = L.circleMarker([entity.latitude, entity.longitude], {
            radius: 6,
            weight: 2,
            fillOpacity: 0.75,
          });
          marker.addTo(layer.current);
          markers.current.set(key, marker);
        }
        marker.off("click");
        marker.on("click", () => select.current(entity));
        marker.setLatLng([entity.latitude, entity.longitude]);
        const state = entity.evidence.freshness;
        // Resolve semantic theme colors in the DOM; no divergent map palette.
        const probe = document.createElement("span");
        probe.style.color = colors[state];
        host.current?.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        marker.setRadius(
          `${entity.evidence.productId}:${entity.id}` === selectedKey ? 10 : 6,
        );
        marker.setStyle({
          color,
          fillColor: color,
          dashArray:
            state === "stale" || state === "unavailable" ? "3 3" : undefined,
        });
        const label = document.createElement("span");
        const time = entity.evidence.observedAt ?? entity.evidence.issuedAt;
        const values = entity.measurements
          .filter((m) => typeof m.value === "number")
          .slice(0, 3)
          .map((m) => measurementDisplay(m.name, m.value, m.unit, locale))
          .join(" · ");
        label.textContent = `${entity.name} · ${copy(productLabel(entity.evidence.productId))}${values ? ` · ${values}` : ""} · ${copy(labels[state])} · ${copy(sourceNames[entity.evidence.sourceId]) ?? entity.evidence.sourceId}${time ? ` · ${new Date(time).toLocaleString(numberLocale, { timeZone: "Europe/Madrid", timeZoneName: "short" })}` : t("map.noObservationTime")}`;
        if (marker.getTooltip()) marker.setTooltipContent(label);
        else marker.bindTooltip(label);
      }
      for (const [key, marker] of markers.current)
        if (!retained.has(key)) {
          layer.current.removeLayer(marker);
          markers.current.delete(key);
        }
    });
    return () => {
      cancelled = true;
    };
  }, [
    features,
    ready,
    resolvedTheme,
    selectedKey,
    t,
    copy,
    numberLocale,
    locale,
  ]);
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <section
        ref={host}
        className="h-[420px] w-full"
        aria-label={t("map.publishedEntityMap")}
      />
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground">
        <p>
          {t("map.viewportRecords")}
          {features ? features.entities.length : t("conversationView.unknown")}{" "}
          {t("map.mapRead")}
          <Instant value={features?.readAt} />
        </p>
        <ul className="dc-map-legend" aria-label={t("map.markerLegend")}>
          <li data-state="recent">{t("map.recent")}</li>
          <li data-state="stale">{t("map.staleDashedOutline")}</li>
          <li data-state="unavailable">
            {t("map.noUsableEvidenceDashedOutline")}
          </li>
          <li data-state="static">{t("insights.reference")}</li>
        </ul>
        <span>
          {t(
            "map.externalBasemapPublishedCoordinatesOnlyListAccessRemainsAvailable",
          )}
        </span>
        {tileError ? (
          <span role="status">
            {t("map.basemapUnavailableEvidenceAndListRemainAvailable")}
          </span>
        ) : null}
        {features?.limited ? (
          <span>{t("map.zoomOrFilterMaximum1000ReturnedMapEntities")}</span>
        ) : null}
        <State data={data} loading={isLoading} error={error} />
      </div>
    </section>
  );
}
