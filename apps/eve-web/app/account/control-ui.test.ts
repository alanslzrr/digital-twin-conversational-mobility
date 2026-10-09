// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ControlForm, errorText, fieldRaw, UiControlError } from "./control-ui";
import { Recovery } from "./recover/recovery";

const auth = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock("./security-panel", () => ({ authRequest: auth }));

vi.mock("@/i18n/provider", () => ({
  useUi: () => ({ locale: "es", numberLocale: "es-ES" }),
}));
let root: Root;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.body.innerHTML = '<div id="fixture"></div>';
  const element = document.getElementById("fixture");
  if (!element) throw new Error("Fixture missing");
  root = createRoot(element);
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.unstubAllGlobals();
});
it("clears write-only fields before awaiting the request and preserves significant password spaces", async () => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let sent = "";
  await act(() =>
    root.render(
      React.createElement(ControlForm, {
        fields: [{ name: "secret", label: "API key", type: "password" }],
        submit: "Guardar",
        onSubmit: async (data) => {
          sent = fieldRaw(data, "secret");
          await pending;
        },
      }),
    ),
  );
  const field = document.querySelector<HTMLInputElement>(
    'input[name="secret"]',
  );
  const form = document.querySelector("form");
  if (!field || !form) throw new Error("Fixture form missing");
  field.value = " synthetic-private-value ";
  await act(() => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  expect(sent).toBe(" synthetic-private-value ");
  expect(field.value).toBe("");
  expect(document.body.innerHTML).not.toContain("synthetic-private-value");
  expect(document.querySelector("fieldset")?.disabled).toBe(true);
  expect(localStorage.length).toBe(0);
  await act(() => release());
  expect(document.querySelector("fieldset")?.disabled).toBe(false);
});
it("shows a safe incident identifier, never raw server error material", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  expect(errorText(new UiControlError("execution_uncertain", id))).toContain(
    id,
  );
  expect(
    errorText(new Error("raw upstream synthetic private material")),
  ).not.toContain("private material");
  expect(
    errorText(new UiControlError("service_unavailable", "injected-url")),
  ).not.toContain("injected-url");
});

it("retains the one-use recovery token through Strict Mode effect replay without persisting or rendering it", async () => {
  window.history.replaceState(
    null,
    "",
    "/account/recover#token=synthetic-one-use",
  );
  await act(() =>
    root.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(Recovery),
      ),
    ),
  );
  expect(window.location.hash).toBe("");
  expect(document.body.innerHTML).not.toContain("synthetic-one-use");
  const input = document.querySelector<HTMLInputElement>(
    'input[name="password"]',
  );
  const form = document.querySelector("form");
  if (!input || !form)
    throw new Error("Recovery form missing after effect replay");
  input.value = "synthetic-password-12";
  await act(() => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  expect(auth).toHaveBeenCalledWith("reset-password", {
    token: "synthetic-one-use",
    newPassword: "synthetic-password-12",
  });
  expect(localStorage.length).toBe(0);
});
