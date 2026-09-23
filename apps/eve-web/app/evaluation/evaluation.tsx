"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type Identity = { principalId: string; label: string };

/** Authentication only: the conversation itself is EVE's official Web Chat. */
export function EvaluationAccess({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/evaluation", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (response.ok) setIdentity(await response.json());
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
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
        {children}
        <div className="fixed top-3 left-4 z-30 flex items-center gap-2">
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
              throw new Error(
                "Credenciales incorrectas o límite de acceso alcanzado. Inténtalo de nuevo en un minuto.",
              );
            const access = await fetch("/api/evaluation", {
              cache: "no-store",
            });
            if (!access.ok)
              throw new Error(
                "Esta cuenta no está habilitada para la evaluación.",
              );
            setIdentity(await access.json());
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
        <Button type="submit">Entrar</Button>
        <p className="text-xs text-muted-foreground">
          Acceso privado · Sin registro público
        </p>
      </form>
    </main>
  );
}
