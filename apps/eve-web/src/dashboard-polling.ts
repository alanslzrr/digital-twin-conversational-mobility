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
