"use client";
import "leaflet/dist/leaflet.css";
import type { DashboardEntity } from "@mobility/contracts";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { useEffect, useRef, useState } from "react";
import { useDashboard } from "@/src/dashboard-client";
import { State } from "./shared";
export default function MobilityMap({
  category,
  source,
  freshness,
  search,
  onSelect,
}: {
  category: string;
  source: string;
  freshness: string;
  search: string;
  onSelect: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<LeafletMap | null>(null),
    layer = useRef<LayerGroup | null>(null);
  const [bbox, setBbox] = useState("-3.9,40.25,-3.5,40.6"),
    [tileError, setTileError] = useState(false),
    [ready, setReady] = useState(false);
  const query = new URLSearchParams({
    category,
    bbox,
    ...(search ? { search } : {}),
    ...(source ? { source } : {}),
    ...(freshness ? { freshness } : {}),
  });
  const { data, error, isLoading } = useDashboard(`map?${query}`, 15000);
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
      const m = L.map(host.current, { preferCanvas: true }).setView(
        [40.4168, -3.7038],
        12,
      );
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
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !layer.current) return;
      layer.current.clearLayers();
      for (const entity of features?.entities ?? []) {
        if (entity.latitude === null || entity.longitude === null) continue;
        const marker = L.circleMarker([entity.latitude, entity.longitude], {
          radius: 6,
          weight: 1,
          fillOpacity: 0.75,
        });
        marker.on("click", () => select.current(entity.id));
        const label = document.createElement("span");
        label.textContent = entity.name;
        marker.bindTooltip(label);
        marker.addTo(layer.current);
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
        <span>
          Fondo externo best-effort · puntos con coordenadas publicadas · tabla
          accesible equivalente
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
