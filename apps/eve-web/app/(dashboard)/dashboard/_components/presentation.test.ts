import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { ActivityChart } from "./insights";
import { InspectionResult } from "./inspection-result";
import { TracePayload } from "./trace-payload";

vi.stubGlobal("React", React);
afterEach(() => vi.clearAllMocks());
it("explains truncated inspection results without a primary JSON wall", () => {
  const html = renderToStaticMarkup(
    React.createElement(InspectionResult, {
      value: {
        tool: "get_bike_availability",
        executionMode: "stored_only",
        evaluatedAt: "2026-10-02T10:00:00Z",
        availability: "partial",
        truncated: true,
        result: {
          stations: [
            {
              name: "QA sintética",
              bikes: 0,
              docks: 3,
              observedAt: "2026-10-02T09:00:00Z",
            },
          ],
        },
      },
    }),
  );
  expect(html).toContain("Resultado incompleto");
  expect(html).toContain("QA sintética");
  expect(html).toContain("Bicicletas disponibles");
  expect(html).toContain("Solo almacenamiento; sin adquisición");
  expect(html).toContain("<details");
  expect(html.indexOf("Resultado incompleto")).toBeLessThan(
    html.indexOf("<details"),
  );
});
it("does not display an uninstrumented activity interval as zero captured", () => {
  const html = renderToStaticMarkup(
    React.createElement(ActivityChart, {
      data: {
        from: "2026-10-02T09:00:00Z",
        to: "2026-10-02T10:00:00Z",
        firstRetainedEventAt: null,
        lastRetainedEventAt: null,
        publications: null,
        errors: null,
        total: null,
        coverage: "best_effort",
        bins: [
          {
            from: "2026-10-02T09:00:00Z",
            to: "2026-10-02T10:00:00Z",
            publications: null,
            errors: null,
          },
        ],
      },
    }),
  );
  expect(html).toContain("Sin dato");
  expect(html).not.toContain("<svg");
});

it("keeps partial coverage distinct from byte truncation", () => {
  const html = renderToStaticMarkup(
    React.createElement(InspectionResult, {
      value: {
        executionMode: "stored_only",
        availability: "partial",
        truncated: false,
        result: { stations: [] },
      },
    }),
  );
  expect(html).toContain("Cobertura parcial");
  expect(html).not.toContain("límite de tamaño");
});
it("does not reconstruct missing private capture", () => {
  const html = renderToStaticMarkup(
    React.createElement(TracePayload, { value: { captureStatus: "missing" } }),
  );
  expect(html).toContain("Lo que nunca se capturó");
});
