"use client";

import { type ControlAction, controlAction } from "@mobility/contracts";
import { type ReactNode, useId, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUi } from "@/i18n/provider";

const errors: Record<string, [string, string]> = {
  authentication_required: ["Inicia sesión de nuevo.", "Sign in again."],
  access_denied: [
    "No tienes permiso para esta acción.",
    "You do not have permission.",
  ],
  mfa_required: [
    "Activa o verifica TOTP en Mi cuenta para administrar mobai.",
    "Enable or verify TOTP in My account before administering mobai.",
  ],
  reauth_required: [
    "Confirma tu contraseña y TOTP para continuar.",
    "Confirm your password and TOTP to continue.",
  ],
  capacity_reached: [
    "Se ha alcanzado la capacidad de cuentas.",
    "Account capacity reached.",
  ],
  last_admin: [
    "Debe quedar un administrador activo.",
    "An active administrator must remain.",
  ],
  credential_invalid: [
    "La key fue rechazada. Reemplázala en Mi cuenta.",
    "The key was rejected. Replace it in My account.",
  ],
  credential_disabled: [
    "La credencial ha cambiado o está desactivada. Selecciónala de nuevo.",
    "The credential changed or was disabled. Select it again.",
  ],
  funding_expired: [
    "El patrocinio está suspendido o ha vencido.",
    "Sponsorship is suspended or expired.",
  ],
  budget_exhausted: [
    "Se agotó el presupuesto o la cuota de tokens.",
    "Budget or token allowance exhausted.",
  ],
  provider_balance: [
    "El proveedor no tiene saldo disponible.",
    "The provider has no available credit.",
  ],
  rate_limited: [
    "Demasiadas solicitudes. Espera antes de reintentar.",
    "Too many requests. Wait before retrying.",
  ],
  context_exceeded: [
    "El contexto no cabe. Compacta con el modelo anterior o inicia otra conversación.",
    "Context does not fit. Compact with the previous model or start a new conversation.",
  ],
  model_incompatible: [
    "El modelo no tiene una configuración compatible verificada.",
    "The model has no verified compatible configuration.",
  ],
  model_denied: [
    "El modelo no está autorizado para esta financiación.",
    "The model is not authorized for this funding.",
  ],
  provider_disabled: [
    "El proveedor está desactivado.",
    "The provider is disabled.",
  ],
  execution_uncertain: [
    "La petición pudo generar gasto. No se repetirá automáticamente; consulta el consumo.",
    "The request may have incurred a charge. It will not be repeated automatically; check usage.",
  ],
  turn_active: [
    "Hay un turno activo o pendiente. Termínalo o cancélalo antes de cambiar.",
    "A turn is running or waiting. Finish or cancel it before switching.",
  ],
  prices_unverified: [
    "Revisa las tarifas y su fecha de validez antes de patrocinar.",
    "Verify prices and their validity before sponsoring.",
  ],
  feature_disabled: [
    "El consumo externo está desactivado en este entorno.",
    "External consumption is disabled in this environment.",
  ],
  service_unavailable: [
    "Servicio no disponible. Revisa el estado de la operación antes de reintentar.",
    "Service unavailable. Check the operation status before retrying.",
  ],
  provider_unavailable: [
    "El proveedor no está disponible.",
    "The provider is unavailable.",
  ],
  provider_consent_required: [
    "Confirma el nuevo destinatario del contexto antes de continuar.",
    "Confirm the new context recipient before continuing.",
  ],
  operation_conflict: [
    "La operación cambió o caducó. Actualiza y revisa su estado.",
    "The operation changed or expired. Refresh and check its status.",
  ],
  not_found: ["El recurso no está disponible.", "The resource is unavailable."],
  invalid_request: [
    "Revisa los campos y los límites del formulario.",
    "Check the form fields and limits.",
  ],
  mail_limited: [
    "Cuota de correo alcanzada. Espera antes de reenviar.",
    "Mail quota reached. Wait before resending.",
  ],
  mail_unavailable: [
    "No se pudo preparar el correo. Revisa su estado antes de reenviar.",
    "Mail could not be prepared. Check its status before resending.",
  ],
};
export class UiControlError extends Error {
  constructor(
    readonly code: string,
    incidentId?: string,
  ) {
    super(
      `${code}${incidentId && /^[0-9a-f-]{36}$/i.test(incidentId) ? ` · ${incidentId}` : ""}`,
    );
  }
}
export function errorText(error: unknown, locale = "es") {
  const message =
    error instanceof Error ? error.message : "service_unavailable";
  const [code = "service_unavailable", incident] = message.split(" · ");
  const label =
    (errors[code] ?? errors.service_unavailable)?.[locale === "en" ? 1 : 0] ??
    code;
  return `${label}${incident && /^[0-9a-f-]{36}$/i.test(incident) ? ` · ${incident}` : ""}`;
}
export async function controlRequest<T = { ok: boolean }>(
  input: ControlAction,
  signal?: AbortSignal,
): Promise<T> {
  const parsed = controlAction.safeParse(input);
  if (!parsed.success) throw new UiControlError("invalid_request");
  const response = await fetch("/api/control", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
    ...(signal ? { signal } : {}),
  });
  const value = await response.json();
  if (!response.ok)
    throw new UiControlError(
      typeof value.error === "string" ? value.error : "service_unavailable",
      typeof value.incidentId === "string" ? value.incidentId : undefined,
    );
  return value as T;
}
export function useControlText() {
  const { locale, numberLocale } = useUi();
  return {
    locale,
    text: (es: string, en: string) => (locale === "en" ? en : es),
    money: (micros: number | null) =>
      micros === null
        ? "—"
        : new Intl.NumberFormat(numberLocale, {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 6,
          }).format(micros / 1_000_000),
  };
}
export function PanelCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  );
}
export type FormField = {
  name: string;
  label: string;
  type?: "text" | "password" | "email" | "number" | "datetime-local";
  value?: string | number;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  hint?: string;
};
export function ControlForm({
  fields,
  submit,
  onSubmit,
  disabled = false,
}: {
  fields: FormField[];
  submit: string;
  onSubmit: (values: FormData) => Promise<void>;
  disabled?: boolean;
}) {
  const id = useId();
  const { locale } = useControlText();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        // Secrets leave the DOM immediately and are never saved as React state or preferences.
        for (const node of form.querySelectorAll<HTMLInputElement>(
          'input[type="password"]',
        ))
          node.value = "";
        setBusy(true);
        setError("");
        try {
          await onSubmit(values);
        } catch (e) {
          setError(errorText(e, locale));
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset
        disabled={disabled || busy}
        className="flex min-w-0 flex-col gap-4"
      >
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <Field key={field.name}>
              <FieldLabel htmlFor={`${id}-${field.name}`}>
                {field.label}
              </FieldLabel>
              {field.options ? (
                <Select
                  name={field.name}
                  defaultValue={String(
                    field.value ?? field.options[0]?.value ?? "",
                  )}
                  required={field.required !== false}
                >
                  <SelectTrigger id={`${id}-${field.name}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {field.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`${id}-${field.name}`}
                  name={field.name}
                  type={field.type ?? "text"}
                  defaultValue={field.value}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  required={field.required !== false}
                  autoComplete={field.type === "password" ? "off" : undefined}
                />
              )}
              {field.hint ? (
                <FieldDescription>{field.hint}</FieldDescription>
              ) : null}
            </Field>
          ))}
        </FieldGroup>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" className="self-start">
          {busy ? "…" : submit}
        </Button>
      </fieldset>
    </form>
  );
}
export function DataTable({
  headings,
  rows,
}: {
  headings: string[];
  rows: Array<{ id: string; cells: ReactNode[] }>;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headings.map((title) => (
            <TableHead key={title}>{title}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((row) => (
            <TableRow key={row.id}>
              {row.cells.map((cell, index) => (
                <TableCell key={headings[index]} className="align-top">
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={headings.length}>—</TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
export const fieldValue = (data: FormData, name: string) =>
  String(data.get(name) ?? "").trim();
export const fieldNumber = (data: FormData, name: string) =>
  Number(fieldValue(data, name));
export const fieldDate = (data: FormData, name: string) =>
  new Date(fieldValue(data, name)).toISOString();
export function dateInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export const fieldRaw = (data: FormData, name: string) =>
  String(data.get(name) ?? "");
