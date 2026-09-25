import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import { evidenceRecall, preserveEvidence } from "./compaction-evidence";

const messages: ModelMessage[] = [
  {
    role: "user",
    content:
      "Desde Atocha (renfe:18000) a Colón el 2026-09-26 a las 09:15 Europe/Madrid. Sin escaleras y máximo 500 m a pie. Mañana no significa hoy.",
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "call1",
        toolName: "get_parking",
        output: {
          type: "json",
          value: {
            place: "Colón",
            availableSpaces: null,
            quality: "stale",
            source: "Madrid",
            observedAt: "2026-09-25T08:00:00Z",
            ingestedAt: "2026-09-25T08:31:00Z",
            uncertainty: "El timestamp agregado no prueba plazas en Colón",
          },
        },
      },
    ],
  },
  {
    role: "assistant",
    content: [
      { type: "text", text: "No hay evidencia de plazas actuales." },
      { type: "reasoning", text: "private reasoning" },
    ],
  },
];
describe("lossless compaction evidence", () => {
  it("retains places, preferences, dates, source, observation/ingestion and uncertainty verbatim", () => {
    const retained = preserveEvidence({ entries: [] }, messages);
    const text = evidenceRecall(retained).messages[0]?.content ?? "";
    for (const fact of [
      "renfe:18000",
      "Colón",
      "2026-09-26",
      "09:15",
      "Europe/Madrid",
      "Sin escaleras",
      "500 m",
      "availableSpaces",
      "null",
      "stale",
      "Madrid",
      "2026-09-25T08:00:00Z",
      "2026-09-25T08:31:00Z",
      "no prueba plazas",
      "No hay evidencia",
    ])
      expect(text).toContain(fact);
    expect(text).not.toContain("private reasoning");
  });
  it("a fabricated summary cannot replace original facts, and repeated capture is idempotent", () => {
    const retained = preserveEvidence({ entries: [] }, messages);
    const summary: ModelMessage = {
      role: "assistant",
      content: "Hay cero plazas actuales; destino cambiado a Chamartín.",
    };
    const again = preserveEvidence(retained, [summary, ...messages]);
    for (const entry of retained.entries)
      expect(again.entries).toContain(entry);
    expect(preserveEvidence(again, [summary, ...messages])).toEqual(again);
  });
  it("excludes consecutive framework checkpoints without dropping literal user corrections", () => {
    const marker = {
      role: "user",
      kind: "context.compaction",
      content: "checkpoint",
    } as ModelMessage;
    const summary: ModelMessage = {
      role: "assistant",
      content: "invented live zero spaces",
    };
    const original = preserveEvidence({ entries: [] }, messages);
    const correction: ModelMessage = { role: "user", content: "checkpoint" };
    const once = preserveEvidence(original, [marker, summary, correction]);
    const twice = preserveEvidence(once, [marker, summary, correction]);
    expect(twice).toEqual(once);
    expect(JSON.stringify(twice)).not.toContain("invented");
    expect(twice.entries.at(-1)).toContain("checkpoint");
    for (const entry of original.entries)
      expect(twice.entries).toContain(entry);
    expect(() => preserveEvidence(original, [marker, correction])).toThrow(
      "original history",
    );
  });
  it("retains contradictory explicit corrections in order rather than guessing", () => {
    const correction: ModelMessage = {
      role: "user",
      content: "Corrección: salir el 2026-09-27, no el 26.",
    };
    const retained = preserveEvidence(
      preserveEvidence({ entries: [] }, messages),
      [correction],
    );
    expect(retained.entries.at(-1)).toContain("2026-09-27");
    expect(retained.entries[0]).toContain("2026-09-26");
  });
  it("fails before destructive compaction when the lossless capsule exceeds its bound", () => {
    const previous = preserveEvidence({ entries: [] }, messages);
    expect(() =>
      preserveEvidence(previous, [
        { role: "user", content: "x".repeat(64_001) },
      ]),
    ).toThrow("original history");
    expect(previous.entries).toHaveLength(3);
  });
  it("does not erase a preference repeated after an explicit correction", () => {
    const a: ModelMessage = { role: "user", content: "Destino Atocha" };
    const b: ModelMessage = { role: "user", content: "Cambio: destino Colón" };
    const retained = preserveEvidence({ entries: [] }, [a, b, a]);
    expect(retained.entries).toHaveLength(3);
    expect(retained.entries.at(-1)).toContain("Atocha");
  });
  it("does not recursively retain EVE recalled records", () => {
    const recalled = {
      role: "user",
      content: "capsule",
      metadata: { "eve.memory": { slot: "evidence" } },
    } as ModelMessage;
    expect(preserveEvidence({ entries: [] }, [recalled]).entries).toEqual([]);
  });
});
