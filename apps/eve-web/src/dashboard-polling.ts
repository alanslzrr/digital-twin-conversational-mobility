export const dashboardIntervals = {
  status: 3000,
  view: 15000,
  heartbeat: 60000,
} as const;
export function pollingEligible(
  at: number,
  interval: number,
  now = Date.now(),
) {
  return now - at >= interval;
}
export function dashboardRetryDelay(
  interval: number,
  retryAfter: number,
  count: number,
) {
  return Math.max(
    interval,
    retryAfter,
    [3000, 6000, 12000, 30000][Math.min(Math.max(count - 1, 0), 3)] ?? 30000,
  );
}
export function startVisibleHeartbeat(
  canRenew: () => boolean,
  renew: () => void,
  clock: { current: number },
) {
  const tick = () => {
    if (
      canRenew() &&
      pollingEligible(clock.current, dashboardIntervals.heartbeat)
    ) {
      clock.current = Date.now();
      renew();
    }
  };
  tick();
  const timer = setInterval(tick, dashboardIntervals.heartbeat);
  return () => clearInterval(timer);
}

export type DashboardRead = {
  at: number;
  value: unknown;
  error?: unknown;
  retryUntil?: number;
};
/** Shared by polling, focus, reconnect and manual rereads; scoped to one identity. */
export async function eligibleDashboardRead(
  path: string,
  interval: number,
  entries: Map<string, DashboardRead>,
  pending: Map<string, Promise<unknown>>,
  request: () => Promise<unknown>,
) {
  const inFlight = pending.get(path);
  if (inFlight) return inFlight;
  const old = entries.get(path);
  if (
    old &&
    (Date.now() < (old.retryUntil ?? 0) ||
      !pollingEligible(old.at, interval || 15000))
  ) {
    if (old.error) throw old.error;
    return old.value;
  }
  const read = (async () => {
    try {
      const value = await request();
      entries.set(path, { at: Date.now(), value });
      return value;
    } catch (error) {
      const delay =
        error &&
        typeof error === "object" &&
        "retryAfter" in error &&
        typeof error.retryAfter === "number" &&
        Number.isFinite(error.retryAfter)
          ? Math.max(0, error.retryAfter)
          : 0;
      entries.set(path, {
        at: Date.now(),
        value: old?.value,
        error,
        retryUntil: Date.now() + delay,
      });
      throw error;
    } finally {
      pending.delete(path);
      while (entries.size > 32)
        entries.delete(entries.keys().next().value ?? "");
    }
  })();
  pending.set(path, read);
  return read;
}
