import { expect, it } from "vitest";
import { measurementDisplay } from "./product-copy";

it("interprets numeric and textual accessibility codes before number formatting", () => {
  for (const value of [1, "1"])
    expect(measurementDisplay("wheelchair", value)).toBe(
      "Declared accessibility",
    );
  for (const value of [2, "2"])
    expect(measurementDisplay("wheelchair", value)).toBe(
      "Not accessible as declared",
    );
  for (const value of [0, "0", 9])
    expect(measurementDisplay("wheelchair", value)).toBe(
      "No verifiable declaration",
    );
  expect(measurementDisplay("wheelchair", null)).toBe("Unknown");
});
it("formats published service clocks without misleading seconds units", () => {
  expect(measurementDisplay("arrivalSeconds", 0, "s")).toBe("00:00");
  expect(measurementDisplay("departureSeconds", 91800, "seconds")).toBe(
    "01:30 (next service day)",
  );
});
it("keeps measured zero, unknown readings, units and booleans distinct", () => {
  expect(measurementDisplay("bikes", 0, "bicicletas")).toBe("0 bicicletas");
  expect(measurementDisplay("temperature", null, "°C")).toBe("Unknown");
  expect(measurementDisplay("renting", false)).toBe("No");
  expect(measurementDisplay("installed", true)).toBe("Yes");
  expect(measurementDisplay("kind", "stop")).toBe("Stop");
  expect(measurementDisplay("basis", "interval")).toBe(
    "Accumulated over the period",
  );
});
