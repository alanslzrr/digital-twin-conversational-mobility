import { historyInputSchema } from "@mobility/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { historicalQuery } from "./history";

const query = vi.hoisted(() => vi.fn());
vi.mock("./database", () => ({ database: () => query }));
beforeEach(() => query.mockReset());
afterEach(() => vi.useRealTimers());

it("accepts EMT and defaults explicitly to event time for compatibility", () => {
  expect(
    historyInputSchema.parse({ source: "emt", at: "2026-09-25T10:00:00Z" })
      .mode,
  ).toBe("event");
  expect(
    historyInputSchema.parse({
      source: "emt",
      at: "2026-09-25T10:00:00Z",
      mode: "knowledge",
    }).mode,
  ).toBe("knowledge");
  expect(
    historyInputSchema.safeParse({
      source: "emt",
      at: "invalid",
      mode: "guess",
    }).success,
  ).toBe(false);
});

it("requires exactly one explicit or server-relative instant", () => {
  expect(
    historyInputSchema.parse({
      source: "bicimad",
      minutesAgo: 10,
      mode: "knowledge",
    }),
  ).toEqual({ source: "bicimad", minutesAgo: 10, mode: "knowledge" });
  for (const input of [
    {},
    { at: "2026-09-25T10:00:00Z", minutesAgo: 10 },
    { minutesAgo: -1 },
    { minutesAgo: 1441 },
    { minutesAgo: Infinity },
    { at: "2026-09-25T10:00:00" },
  ]) {
    expect(
      historyInputSchema.safeParse({ source: "bicimad", ...input }).success,
    ).toBe(false);
  }
});

it("uses the server clock for the reported ten-minute knowledge query and keeps stale evidence", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T12:53:21.916Z"));
  query
    .mockResolvedValueOnce([{ earliest_ingestion: "2026-09-25T09:18:28Z" }])
    .mockResolvedValueOnce([
      {
        job_id: "bicimad",
        observed_at: "2026-09-25T09:18:07Z",
        ingested_at: "2026-09-25T09:18:28Z",
        quality: "provisional",
        raw_reference: "sha256:test",
        revision_id: 1,
        payload: {
          stations: Array.from({ length: 678 }, (_, i) => ({
            id: String(i),
            bikes: 0,
          })),
        },
      },
    ]);
  const result = await historicalQuery({
    source: "bicimad",
    minutesAgo: 10,
    mode: "knowledge",
  });
  expect(result).toMatchObject({
    status: "available",
    at: "2026-09-25T12:43:21.916Z",
    mode: "knowledge",
    timeReference: {
      clock: "mobility_core_server",
      resolvedAt: "2026-09-25T12:53:21.916Z",
    },
  });
  expect("observations" in result && result.observations?.[0]).toMatchObject({
    observedAt: "2026-09-25T09:18:07.000Z",
    ingestedAt: "2026-09-25T09:18:28.000Z",
    knownAfterRequestedTime: false,
    categories: {
      stations: {
        total: 678,
        sample: Array.from({ length: 5 }, (_, i) => ({
          id: String(i),
          bikes: 0,
        })),
      },
    },
  });
  expect(query.mock.calls[1]).toContain("knowledge");
  expect(query.mock.calls[1]).toContainEqual(
    new Date("2026-09-25T12:43:21.916Z"),
  );
});

it.each([
  ["2026-10-25T01:05:00Z", 10, "2026-10-25T00:55:00.000Z"],
  ["2026-03-29T01:05:00Z", 10, "2026-03-29T00:55:00.000Z"],
  ["2026-09-25T00:05:00Z", 10, "2026-09-24T23:55:00.000Z"],
  ["2026-09-25T12:00:00Z", 1440, "2026-09-24T12:00:00.000Z"],
])(
  "resolves elapsed minutes across DST, midnight and retention boundary (%s)",
  async (now, minutesAgo, at) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    query.mockResolvedValue([]);
    expect(
      await historicalQuery({
        source: "bicimad",
        minutesAgo,
        mode: "knowledge",
      }),
    ).toMatchObject({ at, reason: "no_retained_observation_at_instant" });
  },
);

it("preserves absolute instants and the event default for existing callers", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
  query.mockResolvedValue([]);
  expect(
    await historicalQuery({ source: "emt", at: "2026-09-25T11:00:00+02:00" }),
  ).toMatchObject({
    at: "2026-09-25T11:00:00+02:00",
    mode: "event",
    timeReference: { input: "absolute" },
  });
});
