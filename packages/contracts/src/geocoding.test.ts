import { describe, expect, it } from "vitest";
import { z } from "zod";
import { resolveAddressInputSchema } from "./index";

describe("public address tool schema", () => {
  it("exports a flag-independent pattern with the same Unicode control exclusion", () => {
    const schema = z.toJSONSchema(resolveAddressInputSchema);
    const query = schema.properties?.query as { pattern: string };
    expect(query.pattern).not.toContain("\\P");
    const advertised = new RegExp(query.pattern);
    for (let code = 0; code <= 0xffff; code++) {
      const text = `A${String.fromCharCode(code)}B`;
      if (advertised.test(text) !== /^\P{Cc}+$/u.test(text))
        throw new Error(`Control exclusion mismatch at U+${code.toString(16)}`);
    }
    expect(advertised.test("Estación de Atocha · Madrid 🚉")).toBe(true);
  });
  it("keeps Core validation, bounds and external-consent defaults", () => {
    expect(
      resolveAddressInputSchema.parse({ query: "  Plaza de España, Madrid  " }),
    ).toEqual({
      query: "Plaza de España, Madrid",
      allowExternal: false,
    });
    for (const query of ["ab", "x".repeat(161), "A\nB", "A\u0000B", "A\u0085B"])
      expect(resolveAddressInputSchema.safeParse({ query }).success).toBe(
        false,
      );
  });
});
