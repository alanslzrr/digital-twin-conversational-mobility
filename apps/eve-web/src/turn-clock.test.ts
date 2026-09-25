import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import clock from "../agent/instructions/clock";
import { turnClock } from "./turn-clock";

afterEach(() => vi.useRealTimers());
it("refreshes the server anchor every turn, including after a long pause", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T12:53:21.916Z"));
  // Exercise the authored public EVE resolver, not a prompt assembled by a model.
  const resolve = clock.events["turn.started"];
  const context = {} as Parameters<NonNullable<typeof resolve>>[1];
  expect((await resolve?.({}, context))?.content).toContain(
    "2026-09-25T12:53:21.916Z",
  );
  vi.advanceTimersByTime(20 * 60_000);
  expect((await resolve?.({}, context))?.content).toContain(
    "2026-09-25T13:13:21.916Z",
  );
  expect(turnClock()).toContain("Europe/Madrid");
});
it("names the history capability, server-relative knowledge query and discovered-tool reuse", () => {
  const instructions = readFileSync(
    new URL("../agent/instructions.md", import.meta.url),
    "utf8",
  );
  expect(instructions).toContain("get_historical_state");
  expect(instructions).toContain("mode=knowledge");
  expect(instructions).toContain("minutesAgo=10");
  expect(instructions).toContain("connection=mobility");
  expect(instructions).toContain("resolve_place plan_journey");
  expect(instructions).toContain("sin redescubrirlas");
});
