"use client";
import { useEffect, useRef, useState } from "react";
import {
  ControlForm,
  fieldRaw,
  fieldValue,
  PanelCard,
  useControlText,
} from "../control-ui";
import { authRequest } from "../security-panel";
export function Recovery() {
  const { text } = useControlText();
  const token = useRef("");
  const initialized = useRef(false);
  const [reset, setReset] = useState(false),
    [sent, setSent] = useState(false);
  useEffect(() => {
    // Strict Mode replays effects; do not overwrite the captured token after clearing the URL.
    if (initialized.current) return;
    initialized.current = true;
    token.current =
      new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    setReset(Boolean(token.current));
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center px-6">
      <PanelCard
        title={
          reset
            ? text("Establecer contraseña", "Set password")
            : text("Recuperar acceso", "Recover access")
        }
      >
        {sent ? (
          <p role="status">
            {reset
              ? text(
                  "Contraseña actualizada. Inicia sesión de nuevo.",
                  "Password updated. Sign in again.",
                )
              : text(
                  "Si existe una cuenta habilitada, recibirás instrucciones. Revisa también el correo no deseado.",
                  "If an enabled account exists, you will receive instructions. Check your spam folder too.",
                )}
          </p>
        ) : (
          <ControlForm
            fields={
              reset
                ? [
                    {
                      name: "password",
                      label: text(
                        "Nueva contraseña (12–128 caracteres)",
                        "New password (12–128 characters)",
                      ),
                      type: "password",
                    },
                  ]
                : [{ name: "email", label: "Email", type: "email" }]
            }
            submit={
              reset
                ? text("Guardar contraseña", "Save password")
                : text("Enviar instrucciones", "Send instructions")
            }
            onSubmit={async (v) => {
              await authRequest(
                reset ? "reset-password" : "request-password-reset",
                reset
                  ? {
                      token: token.current,
                      newPassword: fieldRaw(v, "password"),
                    }
                  : { email: fieldValue(v, "email") },
              );
              token.current = "";
              setSent(true);
            }}
          />
        )}
        <a href="/evaluation" className="mt-6 block underline">
          {text("Volver al acceso", "Back to sign in")}
        </a>
      </PanelCard>
    </main>
  );
}
