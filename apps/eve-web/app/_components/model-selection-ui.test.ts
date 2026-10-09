// @vitest-environment happy-dom
import type { ControlSnapshot } from "@mobility/contracts";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { availableConnections, useModelSelection } from "./model-selector";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/app/account/control-ui", () => ({
  controlRequest: request,
  errorText: () => "error",
  UiControlError: Error,
  useControlText: () => ({ locale: "es", text: (es: string) => es }),
}));
const snapshot = {
  preference: { modelId: "a", credentialId: "ka" },
  providers: [
    { id: "pa", name: "First", enabled: true },
    { id: "pb", name: "Second", enabled: true },
  ],
  models: [
    { id: "a", name: "Alpha", providerId: "pa", ready: true, enabled: true },
    { id: "b", name: "Beta", providerId: "pb", ready: true, enabled: true },
    { id: "a2", name: "Alpha 2", providerId: "pa", ready: true, enabled: true },
  ],
  credentials: [
    { id: "ka", alias: "Personal A", providerId: "pa", enabled: true },
    { id: "kb", alias: "Personal B", providerId: "pb", enabled: true },
    { id: "dead", alias: "Revoked", providerId: "pb", enabled: false },
  ],
  grants: [
    { id: "g", modelIds: ["b"], status: "active", expiresAt: "2099-01-01" },
  ],
} as unknown as ControlSnapshot;
let root: Root;
let selection: ReturnType<typeof useModelSelection>;
function Fixture() {
  selection = useModelSelection("session");
  return null;
}
beforeEach(async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  request.mockReset().mockImplementation(async (input) => {
    if (input.action === "snapshot") return snapshot;
    if (input.action === "selection.current")
      return {
        selectionId: "bound",
        binding: { providerId: "pa", model: { id: "a" }, credentialId: "ka" },
      };
    return { selectionId: "prepared" };
  });
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  root = createRoot(document.createElement("div"));
  await act(() => root.render(React.createElement(Fixture)));
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("cross-provider selection", () => {
  it("lists all configured connections and never selects an arbitrary payer", () => {
    expect(availableConnections(snapshot, "b").map((c) => c.value)).toEqual([
      "credential:kb",
      "grant:g",
    ]);
    expect(selection.funding).toBe("credential:ka");
  });
  it("uses the explicitly chosen connection and confirms context once", async () => {
    await act(() => selection.chooseModel("b", "credential:kb"));
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("Personal B"),
    );
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("contexto"),
    );
    expect(selection.modelId).toBe("b");
    await act(() => selection.prepare(false));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenLastCalledWith({
      action: "selection.prepare",
      selection: {
        modelId: "b",
        credentialId: "kb",
        sessionId: "session",
        confirmProviderChange: true,
      },
    });
  });
  it("leaves both model and payer unchanged when consent is cancelled", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    await act(() => selection.chooseModel("b", "grant:g"));
    expect(selection.modelId).toBe("a");
    expect(selection.funding).toBe("credential:ka");
  });
  it("does not prompt for a different model on the same connection", async () => {
    await act(() => selection.chooseModel("a2", "credential:ka"));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(selection.modelId).toBe("a2");
  });
  it("rejects disabled or incompatible connections without falling back", async () => {
    await act(() => selection.chooseModel("b", "credential:dead"));
    await act(() => selection.chooseModel("b", "credential:ka"));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(selection.modelId).toBe("a");
  });
  it("keeps a continuation on the existing bound selection", async () => {
    await act(() => selection.chooseModel("b", "grant:g"));
    request.mockClear();
    await act(() => selection.prepare(true));
    expect(request).not.toHaveBeenCalled();
    expect(selection.headers()).toEqual({ "x-mobai-selection": "bound" });
  });
});
