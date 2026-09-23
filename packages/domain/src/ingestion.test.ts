import { describe, expect, it } from "vitest";
import { jobPolicies, localIngestionEnabled, retryDelay } from "./ingestion";

describe("local ingestion policy", () => {
  it("is opt-in and fails closed without local storage", () => {
    expect(localIngestionEnabled({})).toBe(false);
    expect(
      localIngestionEnabled({
        INGESTION_ENABLED: "true",
        DATABASE_URL: "postgres://localhost/db",
      }),
    ).toBe(true);
    expect(
      localIngestionEnabled({
        INGESTION_ENABLED: "true",
        DATABASE_URL: "postgres://cloud.example/db",
      }),
    ).toBe(false);
    expect(
      localIngestionEnabled({
        INGESTION_ENABLED: "true",
        DATABASE_URL: "invalid",
      }),
    ).toBe(false);
  });
  it("never enables local workers in previews or production Vercel", () => {
    expect(
      localIngestionEnabled({
        INGESTION_ENABLED: "true",
        DATABASE_URL: "postgres://localhost/db",
        VERCEL: "1",
        VERCEL_ENV: "preview",
      }),
    ).toBe(false);
  });
  it("bounds exponential retries instead of busy polling", () => {
    expect(retryDelay(20, 0)).toBe(20);
    expect(retryDelay(20, 2)).toBe(80);
    expect(retryDelay(20, 1000)).toBe(900);
  });
  it("uses independent cadence and freshness budgets", () => {
    expect(jobPolicies["renfe-trips"].interval).toBe(20);
    expect(jobPolicies["renfe-trips"].maxAge).toBe(40);
    expect(jobPolicies["madrid-air"].interval).toBe(600);
  });
});
