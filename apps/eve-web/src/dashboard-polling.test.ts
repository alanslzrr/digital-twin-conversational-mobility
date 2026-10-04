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

it("deduplicates slow reads across entry points and keeps the minimum after completion", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  const { eligibleDashboardRead } = await import("./dashboard-polling");
  const entries = new Map(),
    pending = new Map();
  let finish: (value: unknown) => void = () => {};
  const request = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = eligibleDashboardRead(
    "entities",
    15000,
    entries,
    pending,
    request,
  );
  const focus = eligibleDashboardRead(
    "entities",
    15000,
    entries,
    pending,
    request,
  );
  vi.advanceTimersByTime(20000);
  finish({ retained: true });
  expect(await first).toEqual({ retained: true });
  expect(await focus).toEqual({ retained: true });
  expect(request).toHaveBeenCalledTimes(1);
  await eligibleDashboardRead("entities", 15000, entries, pending, request);
  expect(request).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(15000);
  const next = eligibleDashboardRead(
    "entities",
    15000,
    entries,
    pending,
    request,
  );
  finish({ retained: true });
  await next;
  expect(request).toHaveBeenCalledTimes(2);
});
it("respects Retry-After on focus/manual paths and never substitutes another identity's cache", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  const { eligibleDashboardRead } = await import("./dashboard-polling");
  const entries = new Map(),
    pending = new Map();
  const failure = { retryAfter: 60000 };
  const request = vi.fn(async () => {
    throw failure;
  });
  await expect(
    eligibleDashboardRead("status", 3000, entries, pending, request),
  ).rejects.toBe(failure);
  vi.advanceTimersByTime(15000);
  await expect(
    eligibleDashboardRead("status", 3000, entries, pending, request),
  ).rejects.toBe(failure);
  expect(request).toHaveBeenCalledTimes(1);
  const otherIdentity = vi.fn(async () => "different-owner");
  expect(
    await eligibleDashboardRead(
      "status",
      3000,
      new Map(),
      new Map(),
      otherIdentity,
    ),
  ).toBe("different-owner");
  vi.advanceTimersByTime(45000);
  await expect(
    eligibleDashboardRead("status", 3000, entries, pending, request),
  ).rejects.toBe(failure);
  expect(request).toHaveBeenCalledTimes(2);
});
