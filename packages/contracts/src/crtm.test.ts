import { expect, it } from "vitest";
import { crtmTimetableInputSchema, resolvePlaceInputSchema } from "./index";

it("validates CRTM dates, service times and network filters", () => {
  const placeId = "00000000-0000-4000-8000-000000000001";
  expect(
    crtmTimetableInputSchema.parse({ placeId, afterTime: "25:00:00" }).limit,
  ).toBe(10);
  for (const afterTime of ["72:00:00", "24:60:00", "12:34", "-1:00:00"])
    expect(
      crtmTimetableInputSchema.safeParse({ placeId, afterTime }).success,
    ).toBe(false);
  expect(
    crtmTimetableInputSchema.safeParse({ placeId, serviceDate: "2026-02-30" })
      .success,
  ).toBe(false);
  expect(
    resolvePlaceInputSchema.parse({
      query: "Moncloa",
      source: "crtm",
      network: "interurban",
    }).source,
  ).toBe("crtm");
});
