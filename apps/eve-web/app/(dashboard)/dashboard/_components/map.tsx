"use client";
import "leaflet/dist/leaflet.css";
import type { DashboardEntity } from "@mobility/contracts";
import type { CircleMarker, LayerGroup, Map as LeafletMap } from "leaflet";
import { useEffect, useRef, useState } from "react";
import { useDashboard } from "@/src/dashboard-client";
import { productLabel } from "./product-copy";
import { publicLabel, State } from "./shared";
export default function MobilityMap({
  category,
  section,
  product,
  source,
  freshness,
  search,
  onSelect,
}: {
  category: string;
  section: string;
  product: string;
  source: string;
  freshness: string;
  search: string;
  onSelect: (id: string, product: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<LeafletMap | null>(null),
    layer = useRef<LayerGroup | null>(null);
  const markers = useRef(new Map<string, CircleMarker>());
  const [bbox, setBbox] = useState("-3.9,40.25,-3.5,40.6"),
    [tileError, setTileError] = useState(false),
    [ready, setReady] = useState(false);
  const query = new URLSearchParams({
    category,
    section,
    ...(product ? { product } : {}),
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
    | { entities: DashboardEntity[]; limited: boolean }
    | undefined;
  const select = useRef(onSelect);
  select.current = onSelect;
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
      L.control
        .zoom({ zoomInTitle: "Acercar mapa", zoomOutTitle: "Alejar mapa" })
        .addTo(m);
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
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !layer.current) return;
      const retained = new Set<string>();
      const colors = {
        recent: "var(--primary)",
        recently_checked: "var(--primary)",
        stale: "var(--muted-foreground)",
        unavailable: "var(--destructive)",
        static: "var(--foreground)",
        unknown: "var(--destructive)",
      };
      const labels = {
        recent: "Lectura reciente",
        recently_checked: "Predicción comprobada",
        stale: "Dato antiguo",
        unavailable: "Sin lectura utilizable",
        static: "Referencia",
        unknown: "Antigüedad desconocida",
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
          marker.on("click", () =>
            select.current(entity.id, entity.evidence.productId),
          );
          marker.addTo(layer.current);
          markers.current.set(key, marker);
        }
        marker.setLatLng([entity.latitude, entity.longitude]);
        const state = entity.evidence.freshness;
        // Resolve semantic theme colors in the DOM; no divergent map palette.
        const probe = document.createElement("span");
        probe.style.color = colors[state];
        host.current?.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
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
          .map((m) => `${publicLabel(m.name)}: ${m.value} ${m.unit ?? ""}`)
          .join(" · ");
        label.textContent = `${entity.name} · ${productLabel(entity.evidence.productId)}${values ? ` · ${values}` : ""} · ${labels[state]} · ${entity.evidence.sourceId}${time ? ` · ${new Date(time).toLocaleString("es-ES", { timeZone: "Europe/Madrid", timeZoneName: "short" })}` : " · Sin fecha de observación"}`;
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
  }, [features, ready]);
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <section
        ref={host}
        className="h-[420px] w-full"
        aria-label="Mapa de entidades publicadas"
      />
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground">
        <p>
          Lectura reciente · dato antiguo (contorno discontinuo) · sin lectura
          utilizable · referencia. El color no sustituye las fechas de la ficha.
        </p>
        <span>
          Fondo cartográfico externo, disponible según el servicio · puntos con
          coordenadas publicadas · los mismos datos se pueden consultar en la
          tabla
        </span>
        {tileError ? (
          <span role="status">
            Fondo cartográfico no disponible; los datos y la tabla siguen
            disponibles.
          </span>
        ) : null}
        {features?.limited ? (
          <span>
            Acerca el mapa o filtra. Máximo 1.000 entidades devueltas.
          </span>
        ) : null}
        <State loading={isLoading} error={error} />
      </div>
    </section>
  );
}
