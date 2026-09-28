import { expect, it } from "vitest";
import { weatherFreshness } from "./weather";

const now = Date.parse("2026-09-28T12:00:00Z");
const at = (seconds: number) => new Date(now - seconds * 1000).toISOString();
it("distinguishes forecast and CAP check policies, provider failure and unavailable data", () => {
  expect(weatherFreshness("forecast", at(1200), at(3600), null, now)).toBe(
    "recently_checked",
  );
  expect(weatherFreshness("warnings", at(1200), at(3600), null, now)).toBe(
    "stale",
  );
  expect(
    weatherFreshness("warnings", at(0), at(3600), "upstream_http_429", now),
  ).toBe("stale");
  expect(weatherFreshness("forecast", null, null, null, now)).toBe(
    "unavailable",
  );
});
it("never keeps forecast evidence indefinitely or accepts a future clock", () => {
  expect(weatherFreshness("forecast", at(0), at(86401), null, now)).toBe(
    "unavailable",
  );
  expect(weatherFreshness("warnings", at(86401), at(86401), null, now)).toBe(
    "unavailable",
  );
  expect(weatherFreshness("warnings", at(-60), at(0), null, now)).toBe(
    "unavailable",
  );
  expect(weatherFreshness("forecast", at(0), at(-600), null, now)).toBe(
    "unavailable",
  );
});
