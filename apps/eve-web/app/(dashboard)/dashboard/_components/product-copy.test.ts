import { expect, it } from "vitest";
import { measurementDisplay } from "./product-copy";

it("interprets numeric and textual accessibility codes before number formatting", () => {
  for (const value of [1, "1"])
    expect(measurementDisplay("wheelchair", value)).toBe(
      "Accesibilidad declarada",
    );
  for (const value of [2, "2"])
    expect(measurementDisplay("wheelchair", value)).toBe(
      "No accesible según declaración",
    );
  for (const value of [0, "0", 9])
    expect(measurementDisplay("wheelchair", value)).toBe(
      "Sin declaración verificable",
    );
  expect(measurementDisplay("wheelchair", null)).toBe("Sin dato");
});
it("formats published service clocks without misleading seconds units", () => {
  expect(measurementDisplay("arrivalSeconds", 0, "s")).toBe("00:00");
  expect(measurementDisplay("departureSeconds", 91800, "seconds")).toBe(
    "01:30 (día siguiente del servicio)",
  );
});
it("keeps measured zero, unknown readings, units and booleans distinct", () => {
  expect(measurementDisplay("bikes", 0, "bicicletas")).toBe("0 bicicletas");
  expect(measurementDisplay("temperature", null, "°C")).toBe("Sin dato");
  expect(measurementDisplay("renting", false)).toBe("No");
  expect(measurementDisplay("installed", true)).toBe("Sí");
  expect(measurementDisplay("kind", "stop")).toBe("Parada");
  expect(measurementDisplay("basis", "interval")).toBe(
    "Acumulada durante el periodo",
  );
});
