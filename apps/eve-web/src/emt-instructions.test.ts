import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("exposes EMT arrivals without obsolete denials or conflating them with routing/history", () => {
  const instructions = readFileSync(
    new URL("../agent/instructions.md", import.meta.url),
    "utf8",
  );
  const connection = readFileSync(
    new URL("../agent/connections/mobility.ts", import.meta.url),
    "utf8",
  );
  expect(connection).toContain('"get_emt_arrivals"');
  expect(instructions).toContain("resolve_place get_emt_arrivals");
  expect(instructions).toContain("source=emt");
  expect(instructions).not.toContain("no hay llegadas ni rutas EMT");
  expect(instructions).toContain("no forman parte del histórico");
  expect(instructions).toContain("Powered by EMT de Madrid");
  expect(instructions).toContain(
    "No repitas llamadas para saltar caché/backoff",
  );
});
