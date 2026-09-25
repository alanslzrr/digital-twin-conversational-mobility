import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("exposes CRTM discovery without claiming RT, routing or exact frequency departures", () => {
  const connection = readFileSync(
    new URL("../agent/connections/mobility.ts", import.meta.url),
    "utf8",
  );
  const instructions = readFileSync(
    new URL("../agent/instructions.md", import.meta.url),
    "utf8",
  );
  expect(connection).toContain('"get_crtm_timetable"');
  expect(instructions).toContain("resolve_place get_crtm_timetable");
  expect(instructions).toContain("exactTimes=0");
  expect(instructions).toContain("Metro caducado devuelve unavailable");
});
