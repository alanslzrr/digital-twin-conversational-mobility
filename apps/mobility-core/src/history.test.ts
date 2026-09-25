import { historyInputSchema } from "@mobility/contracts";
import { expect, it } from "vitest";

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
