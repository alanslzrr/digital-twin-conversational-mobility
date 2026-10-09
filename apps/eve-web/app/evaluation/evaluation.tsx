"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { MobaiBrand } from "@/components/mobai-brand";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useUi } from "@/i18n/provider";
import {
  canonicalLocalEvaluationUrl,
  evaluationLoginError,
} from "@/src/evaluation-login";
import { AccessControls } from "./access-controls";

type Identity = {
  principalId: string;
  label: string;
  role?: "admin" | "evaluator";
};

/** Authentication only: the conversation itself is EVE's official Web Chat. */
export function EvaluationAccess({ children }: { children: ReactNode }) {
  const { t, copy, locale } = useUi();
  const [challenge, setChallenge] = useState<"" | "totp" | "backup">("");

  const identityRequest = useRef<AbortController | undefined>(undefined);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState<string | null>(null);
  useEffect(() => {
    const canonical = canonicalLocalEvaluationUrl(window.location.href);
    if (canonical) {
      setCanonicalUrl(canonical);
      setLoading(false);
      return;
    }
    const check = () => {
      identityRequest.current?.abort();
      const current = new AbortController();
      identityRequest.current = current;
      fetch("/api/evaluation", { signal: current.signal, cache: "no-store" })
        .then(async (response) => {
          const identity = response.ok ? await response.json() : null;
          if (current.signal.aborted) return;
          setIdentity(identity);
          if (!response.ok && response.status !== 401)
            setError(evaluationLoginError(response.status));
        })
        .catch(() => {
          if (!current.signal.aborted) {
            setIdentity(null);
            setError("No se pudo comprobar el acceso.");
          }
        })
        .finally(() => {
          if (!current.signal.aborted) setLoading(false);
        });
    };
    const visible = () => {
      if (document.visibilityState === "visible") check();
    };
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", visible);
    return () => {
      identityRequest.current?.abort();
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  if (loading)
    return (
      <main className="flex h-dvh items-center justify-center">
        <Spinner aria-label={t("evaluation.comprobandoAcceso")} />
      </main>
    );
  if (identity)
    return (
      <>
        <div key={`chat:${identity.principalId}`}>{children}</div>
        <AccessControls
          key={`access:${identity.principalId}`}
          error={error}
          admin={identity.role === "admin"}
          onSignOut={async () => {
            try {
              const result = await fetch("/api/auth/sign-out", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              });
              if (!result.ok) throw new Error();
              identityRequest.current?.abort();
              setIdentity(null);
              // Unmount the runtime and clear the current session URL on logout.
              window.location.replace("/evaluation");
            } catch {
              setError("No se pudo cerrar sesión. Inténtalo de nuevo.");
            }
          }}
        />
      </>
    );

  return (
    <main className="ui-login">
      <div className="ui-login-panel">
        <div className="ui-login-preferences ui-preferences">
          <LocaleSwitcher />
          <ThemeSwitcher />
        </div>
        <form
          className="ui-login-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (canonicalUrl) return;
            identityRequest.current?.abort();
            const data = new FormData(event.currentTarget);
            const passwordInput =
              event.currentTarget.querySelector<HTMLInputElement>(
                'input[type="password"]',
              );
            if (passwordInput) passwordInput.value = "";
            setLoading(true);
            setError("");
            try {
              const response = await fetch(
                challenge
                  ? `/api/auth/two-factor/verify-${challenge === "totp" ? "totp" : "backup-code"}`
                  : "/api/auth/sign-in/email",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(
                    challenge
                      ? { code: data.get("code"), trustDevice: false }
                      : {
                          email: data.get("email"),
                          password: data.get("password"),
                        },
                  ),
                },
              );
              if (!response.ok)
                throw new Error(evaluationLoginError(response.status));
              const result = await response.json();
              if (result.twoFactorRedirect) {
                setChallenge("totp");
                return;
              }
              const access = await fetch("/api/evaluation", {
                cache: "no-store",
              });
              if (!access.ok)
                throw new Error(
                  access.status >= 500 || access.status === 429
                    ? evaluationLoginError(access.status)
                    : "Esta cuenta no está habilitada para la evaluación.",
                );
              const nextIdentity = await access.json();
              identityRequest.current?.abort();
              setIdentity(nextIdentity);
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "No se pudo conectar.",
              );
            } finally {
              setLoading(false);
            }
          }}
        >
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-medium tracking-tight">
              <MobaiBrand size="login" />
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("evaluation.accedeConTusCredencialesDeEvaluacion")}
            </p>
          </div>
          <FieldGroup>
            {challenge ? (
              <Field>
                <FieldLabel htmlFor="code">
                  {challenge === "totp"
                    ? "TOTP"
                    : locale === "es"
                      ? "Código de recuperación"
                      : "Recovery code"}
                </FieldLabel>
                <Input
                  id="code"
                  name="code"
                  autoComplete="one-time-code"
                  required
                  maxLength={64}
                />
                <Button
                  type="button"
                  variant="link"
                  onClick={() =>
                    setChallenge(challenge === "totp" ? "backup" : "totp")
                  }
                >
                  {challenge === "totp"
                    ? locale === "es"
                      ? "Usar código de recuperación"
                      : "Use recovery code"
                    : "Usar TOTP / Use TOTP"}
                </Button>
              </Field>
            ) : (
              <>
                <Field>
                  <FieldLabel htmlFor="email">
                    {t("evaluation.correo")}
                  </FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    spellCheck={false}
                    autoComplete="username"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">
                    {t("evaluation.contrasena")}
                  </FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    minLength={12}
                    maxLength={128}
                    required
                  />
                </Field>
              </>
            )}
          </FieldGroup>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {copy(error)}
            </p>
          ) : null}
          {canonicalUrl ? (
            <p role="alert" className="text-sm text-muted-foreground">
              {t("evaluation.esteOrigenNoAdmiteElAccesoLocalAbre")}{" "}
              <a href={canonicalUrl} className="underline">
                {canonicalUrl}
              </a>{" "}
              {t("evaluation.paraIniciarSesion")}
            </p>
          ) : null}
          <Button type="submit" disabled={Boolean(canonicalUrl)}>
            {t("evaluation.entrar")}
          </Button>
          <a href="/account/recover" className="text-sm underline">
            {locale === "es" ? "Recuperar acceso" : "Recover access"}
          </a>
          <p className="text-xs text-muted-foreground">
            {t("evaluation.accesoPrivadoSinRegistroPublico")}
          </p>
        </form>
      </div>
    </main>
  );
}
