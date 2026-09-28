import type { SourceId } from "@mobility/contracts";

export const jobPolicies = {
  "dgt-incidents": { source: "dgt", interval: 60, maxAge: 180 },
  "emt-alerts": { source: "emt", interval: 120, maxAge: 600 },
  "renfe-trips": { source: "renfe", interval: 20, maxAge: 40 },
  "renfe-alerts": { source: "renfe", interval: 30, maxAge: 90 },
  bicimad: { source: "bicimad", interval: 20, maxAge: 60 },
  "madrid-air": { source: "madrid-air", interval: 600, maxAge: 7200 },
  "madrid-traffic": { source: "madrid-traffic", interval: 300, maxAge: 900 },
  "madrid-parking": { source: "madrid-parking", interval: 60, maxAge: 300 },
  aemet: { source: "aemet", interval: 600, maxAge: 7200 },
} as const satisfies Record<
  string,
  { source: SourceId; interval: number; maxAge: number }
>;
export type JobId = keyof typeof jobPolicies;

export function retryDelay(interval: number, failures: number) {
  return Math.min(900, interval * 2 ** Math.min(6, Math.max(0, failures)));
}

export function localIngestionEnabled(env: Record<string, string | undefined>) {
  if (env.INGESTION_ENABLED !== "true" || env.VERCEL) return false;
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(
      new URL(env.DATABASE_URL ?? "").hostname,
    );
  } catch {
    return false;
  }
}

// Orthogonal to data freshness: a live worker can serve old provider readings,
// and an inactive window can still contain fresh data. Never infer provider health.
export function ingestionWorkerState(
  enabled: boolean,
  active: boolean,
  heartbeatAgeSeconds: number | null,
) {
  if (!enabled) return "disabled";
  if (heartbeatAgeSeconds === null) return "not_seen";
  if (heartbeatAgeSeconds > 120) return "stopped_or_unreachable";
  return active ? "running" : "inactive_window";
}
