"use client";
import type { ControlAction, ControlSnapshot } from "@mobility/contracts";
import { useState } from "react";
import {
  ControlForm,
  fieldRaw,
  fieldValue,
  PanelCard,
  UiControlError,
  useControlText,
} from "./control-ui";

export async function authRequest(path: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new UiControlError("access_denied");
  return result;
}
export function SecurityPanel({
  data,
  run,
  reload,
}: {
  data: ControlSnapshot;
  run: (action: ControlAction) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const { text } = useControlText();
  const [enrollment, setEnrollment] = useState<{
    secret: string;
    codes: string[];
  } | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <PanelCard
        title={text("Protección de la cuenta", "Account protection")}
        description={text(
          "TOTP es obligatorio para administrar mobai. Guarda los códigos de recuperación fuera del navegador.",
          "TOTP is required to administer mobai. Save recovery codes outside the browser.",
        )}
      >
        {data.identity.mfa ? (
          <p>{text("TOTP activado.", "TOTP enabled.")}</p>
        ) : data.identity.twoFactorEnabled ? (
          <ControlForm
            fields={[{ name: "code", label: "TOTP" }]}
            submit={text(
              "Verificar TOTP de esta sesión",
              "Verify TOTP for this session",
            )}
            onSubmit={async (v) => {
              await authRequest("two-factor/verify-totp", {
                code: fieldValue(v, "code"),
                trustDevice: false,
              });
              await reload();
            }}
          />
        ) : (
          <ControlForm
            fields={[
              {
                name: "password",
                label: text("Contraseña actual", "Current password"),
                type: "password",
              },
            ]}
            submit={text("Configurar TOTP", "Set up TOTP")}
            onSubmit={async (v) => {
              const result = await authRequest("two-factor/enable", {
                password: fieldRaw(v, "password"),
              });
              setEnrollment({
                secret:
                  new URL(result.totpURI).searchParams.get("secret") ?? "",
                codes: result.backupCodes,
              });
            }}
          />
        )}
        {enrollment ? (
          <div className="mt-6 flex flex-col gap-4">
            <p>
              {text(
                "Añade esta clave a tu aplicación de autenticación:",
                "Add this secret to your authenticator:",
              )}
            </p>
            <code className="break-all">{enrollment.secret}</code>
            <p>
              {text(
                "Códigos de recuperación (se muestran solo ahora):",
                "Recovery codes (shown only now):",
              )}
            </p>
            <pre className="overflow-auto">{enrollment.codes.join("\n")}</pre>
            <ControlForm
              fields={[
                { name: "code", label: text("Código TOTP", "TOTP code") },
              ]}
              submit={text("Verificar y cerrar", "Verify and close")}
              onSubmit={async (v) => {
                await authRequest("two-factor/verify-totp", {
                  code: fieldValue(v, "code"),
                });
                setEnrollment(null);
                await reload();
              }}
            />
          </div>
        ) : null}
      </PanelCard>
      {data.identity.role === "admin" && data.identity.mfa ? (
        <PanelCard
          title={text(
            "Autorizar cambios administrativos",
            "Authorize administrative changes",
          )}
          description={text(
            "La autorización dura cinco minutos y no sustituye los permisos de cada operación.",
            "Authorization lasts five minutes and does not replace operation permissions.",
          )}
        >
          <ControlForm
            fields={[
              {
                name: "password",
                label: text("Contraseña", "Password"),
                type: "password",
              },
              { name: "code", label: "TOTP" },
            ]}
            submit={text("Reautenticar", "Reauthenticate")}
            onSubmit={(v) =>
              run({
                action: "reauth",
                password: fieldRaw(v, "password"),
                code: fieldValue(v, "code"),
              })
            }
          />
        </PanelCard>
      ) : null}
      <PanelCard title={text("Cambiar contraseña", "Change password")}>
        <ControlForm
          fields={[
            {
              name: "current",
              label: text("Contraseña actual", "Current password"),
              type: "password",
            },
            {
              name: "next",
              label: text(
                "Nueva contraseña (12 caracteres mínimo)",
                "New password (12 characters minimum)",
              ),
              type: "password",
            },
          ]}
          submit={text("Cambiar contraseña", "Change password")}
          onSubmit={async (v) => {
            await authRequest("change-password", {
              currentPassword: fieldRaw(v, "current"),
              newPassword: fieldRaw(v, "next"),
              revokeOtherSessions: true,
            });
            await reload();
          }}
        />
      </PanelCard>
    </div>
  );
}
