import { afterEach, expect, it, vi } from "vitest";
import {
  dashboardIntervals,
  dashboardRetryDelay,
  pollingEligible,
  startVisibleHeartbeat,
} from "./dashboard-polling";

afterEach(() => vi.useRealTimers());
it("keeps independent status/view/heartbeat cadences and suppresses focus within eligibility", () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  expect(dashboardIntervals).toEqual({
    status: 3000,
    view: 15000,
    heartbeat: 60000,
  });
  const at = Date.now();
  vi.advanceTimersByTime(3000);
  expect(pollingEligible(at, 3000)).toBe(true);
  expect(pollingEligible(at, 15000)).toBe(false);
  vi.advanceTimersByTime(12000);
  expect(pollingEligible(at, 15000)).toBe(true);
});
it("does not renew hidden/offline/paused; resumes without duplicate lease and clears timers", () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  let visible = true;
  const renew = vi.fn(),
    clock = { current: 0 };
  const stop = startVisibleHeartbeat(() => visible, renew, clock);
  expect(renew).toHaveBeenCalledTimes(1);
  visible = false;
  vi.advanceTimersByTime(180000);
  expect(renew).toHaveBeenCalledTimes(1);
  visible = true;
  vi.advanceTimersByTime(60000);
  expect(renew).toHaveBeenCalledTimes(2);
  stop();
  vi.advanceTimersByTime(600000);
  expect(renew).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
it("floors retries by surface eligibility and respects server retry-after", () => {
  expect([1, 2, 3, 4].map((i) => dashboardRetryDelay(0, 0, i))).toEqual([
    3000, 6000, 12000, 30000,
  ]);
  expect(dashboardRetryDelay(15000, 0, 1)).toBe(15000);
  expect(dashboardRetryDelay(3000, 60000, 2)).toBe(60000);
});
