import { sourceIdSchema } from "@mobility/contracts";
import { describe, expect, it } from "vitest";
import { getSourceHealth, sourceCatalog } from "./index";

describe("source catalog", () => {
  it("covers every contract source once", () => {
    expect(sourceCatalog.map((source) => source.id).sort()).toEqual(
      [...sourceIdSchema.options].sort(),
    );
  });
  it("does not claim live data before ingestion exists", () => {
    expect(getSourceHealth().liveDataReady).toBe(false);
    expect(
      getSourceHealth().sources.every(
        (source) => source.lastObservedAt === null,
      ),
    ).toBe(true);
  });
  it("filters by canonical source identity", () => {
    expect(getSourceHealth("renfe").sources.map((source) => source.id)).toEqual(
      ["renfe"],
    );
  });
});
