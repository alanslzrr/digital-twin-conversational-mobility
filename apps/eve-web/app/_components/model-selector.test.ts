import type { ControlSnapshot } from "@mobility/contracts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ModelSelector,
  supportsSelection,
  type useModelSelection,
} from "./model-selector";

vi.stubGlobal("React", React);
vi.mock("@/app/account/control-ui", () => ({
  useControlText: () => ({ text: (es: string) => es }),
}));
const data = {
  providers: [
    { id: "p", enabled: true },
    { id: "other", enabled: true },
  ],
  models: [
    {
      id: "one",
      name: "Model One",
      providerId: "p",
      ready: true,
      enabled: true,
    },
    {
      id: "two",
      name: "Model Two",
      providerId: "p",
      ready: true,
      enabled: true,
    },
    { id: "other", providerId: "other", ready: true, enabled: true },
  ],
  credentials: [{ id: "key", providerId: "p", enabled: true, deleted: false }],
  grants: [
    {
      id: "grant",
      status: "active",
      expiresAt: "2099-01-01",
      modelIds: ["one"],
    },
  ],
} as unknown as ControlSnapshot;

describe("composer model selector", () => {
  it("keeps model changes on the explicitly selected credential or grant", () => {
    expect(supportsSelection(data, "two", "credential:key")).toBe(true);
    expect(supportsSelection(data, "other", "credential:key")).toBe(false);
    expect(supportsSelection(data, "one", "grant:grant")).toBe(true);
    expect(supportsSelection(data, "two", "grant:grant")).toBe(false);
    expect(supportsSelection(data, "one", "")).toBe(false);
    expect(supportsSelection(null, "one", "credential:key")).toBe(false);
  });
  it("renders only a compact model trigger, not a configuration form", () => {
    const selection = {
      data,
      modelId: "one",
      funding: "credential:key",
    } as ReturnType<typeof useModelSelection>;
    const html = renderToStaticMarkup(
      React.createElement(ModelSelector, {
        selection,
        disabled: false,
        canCompact: true,
        onCompact: async () => {},
      }),
    );
    expect(html).toContain("Model One");
    expect(html).toContain('aria-label="Cambiar modelo"');
    expect(html).not.toMatch(
      /Financiación|Proveedor|fieldset|Compactar antes|Selección fijada/,
    );
    expect(html).toContain('type="button"');
  });
  it("locks the trigger while a turn is in progress", () => {
    const html = renderToStaticMarkup(
      React.createElement(ModelSelector, {
        selection: { data, modelId: "one" } as ReturnType<
          typeof useModelSelection
        >,
        disabled: true,
        canCompact: false,
        onCompact: async () => {},
      }),
    );
    expect(html).toContain('disabled=""');
  });
});
