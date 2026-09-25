import catalog from "./madrid-air-stations.json";

// Static catalog identity does not assert that an analyzer is operating now.
export function airStationIdentity(stationId: string, samplingPoint: string) {
  const full = samplingPoint.split("_")[0];
  const short = /^\d{1,3}$/.test(stationId) ? String(Number(stationId)) : null;
  const station = catalog.stations.find(
    (s) =>
      (short ? s.shortId === short : s.id === stationId) &&
      (!full || s.id === full),
  );
  return {
    id: stationId,
    samplingPoint,
    canonicalId: station?.id ?? null,
    name: station?.name ?? null,
    location: station
      ? { latitude: station.latitude, longitude: station.longitude }
      : null,
    status: station ? "matched_static_catalog" : "partial",
    catalogProvenance: {
      sourceUrl: catalog.sourceUrl,
      retrievedAt: catalog.retrievedAt,
      sha256: catalog.sha256,
      kind: "static_catalog",
    },
  };
}
