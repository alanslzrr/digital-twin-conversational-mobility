"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  canonicalLocalEvaluationUrl,
  evaluationLoginError,
} from "@/src/evaluation-login";

import { Conversations } from "./conversations";

type Identity = { principalId: string; label: string };

/** Authentication only: the conversation itself is EVE's official Web Chat. */
export function EvaluationAccess({ children }: { children: ReactNode }) {
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
        <Spinner aria-label="Comprobando acceso" />
      </main>
    );
  if (identity)
    return (
      <>
        <div key={`chat:${identity.principalId}`}>{children}</div>
        <div
          key={`access:${identity.principalId}`}
          className="fixed top-3 left-2 z-30 flex items-center gap-1"
        >
          <Conversations />
          <Button variant="ghost" size="sm" asChild>
            <a href="/dashboard">Panel</a>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const id = window.location.pathname.split("/")[2];
              window.location.href = id
                ? `/dashboard/conversations/${id}`
                : "/dashboard/conversations";
            }}
          >
            Telemetría
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
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
          >
            Cerrar sesión
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </>
    );

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <form
        className="flex w-full max-w-sm flex-col gap-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (canonicalUrl) return;
          identityRequest.current?.abort();
          const data = new FormData(event.currentTarget);
          setLoading(true);
          setError("");
          try {
            const response = await fetch("/api/auth/sign-in/email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: data.get("email"),
                password: data.get("password"),
              }),
            });
            if (!response.ok)
              throw new Error(evaluationLoginError(response.status));
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
            Madrid Mobility
          </h1>
          <p className="text-sm text-muted-foreground">
            Accede con tus credenciales de evaluación.
          </p>
        </div>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Correo</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Contraseña</FieldLabel>
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
        </FieldGroup>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {canonicalUrl ? (
          <p role="alert" className="text-sm text-muted-foreground">
            Este origen no admite el acceso local. Abre{" "}
            <a href={canonicalUrl} className="underline">
              {canonicalUrl}
            </a>{" "}
            para iniciar sesión.
          </p>
        ) : null}
        <Button type="submit" disabled={Boolean(canonicalUrl)}>
          Entrar
        </Button>
        <p className="text-xs text-muted-foreground">
          Acceso privado · Sin registro público
        </p>
      </form>
    </main>
  );
}
