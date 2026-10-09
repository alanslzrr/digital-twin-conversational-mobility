"use client";

import type {
  ControlAction,
  ControlSnapshot,
  ModelProfile,
} from "@mobility/contracts";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ControlForm,
  controlRequest,
  DataTable,
  dateInput,
  type FormField,
  fieldDate,
  fieldNumber,
  fieldValue,
  PanelCard,
  useControlText,
} from "./control-ui";

type Props = {
  data: ControlSnapshot;
  run: (action: ControlAction) => Promise<void>;
};
const yesNo = [
  { value: "true", label: "Sí / Yes" },
  { value: "false", label: "No" },
];
const enabled = (v: FormData, name: string) => fieldValue(v, name) === "true";
const future = () =>
  dateInput(new Date(Date.now() + 30 * 86400_000).toISOString());
const usd = (v: FormData, name: string) =>
  Math.round(fieldNumber(v, name) * 1_000_000);
const moneyField = (
  name: string,
  label: string,
  value?: number,
): FormField => ({
  name,
  label,
  type: "number",
  min: 0.000001,
  step: "0.000001",
  ...(value === undefined ? {} : { value: value / 1_000_000 }),
});

export function UsersPanel({ data, run }: Props) {
  const { text } = useControlText();
  return (
    <div className="grid gap-6">
      <PanelCard
        title={text("Invitar una cuenta", "Invite an account")}
        description={text(
          "Cuenta pendiente, sin contraseña para el administrador. El correo se envía solo cuando Resend está habilitado.",
          "Pending account; no password is given to the administrator. Email is sent only when Resend is enabled.",
        )}
      >
        <ControlForm
          fields={[
            { name: "name", label: text("Nombre", "Name") },
            { name: "email", label: "Email", type: "email" },
          ]}
          submit={text("Crear e invitar", "Create and invite")}
          onSubmit={(v) =>
            run({
              action: "user.invite",
              name: fieldValue(v, "name"),
              email: fieldValue(v, "email"),
            })
          }
        />
      </PanelCard>
      <PanelCard
        title={text("Cuentas e invitaciones", "Accounts and invitations")}
      >
        <DataTable
          headings={[
            text("Cuenta", "Account"),
            text("Estado", "Status"),
            text("Administrar", "Manage"),
          ]}
          rows={data.users.map((u) => ({
            id: u.id,
            cells: [
              <div key="user">
                {u.label}
                <p className="text-muted-foreground">{u.email}</p>
              </div>,
              `${u.role} · ${u.state} · ${u.enabled ? "on" : "off"}`,
              <details key="edit">
                <summary className="cursor-pointer">
                  {text("Permisos y recuperación", "Permissions and recovery")}
                </summary>
                <div className="min-w-64 pt-4">
                  <ControlForm
                    fields={[
                      {
                        name: "role",
                        label: text("Rol", "Role"),
                        value: u.role,
                        options: [
                          { value: "evaluator", label: "Evaluador" },
                          { value: "admin", label: "Administrador" },
                        ],
                      },
                      {
                        name: "enabled",
                        label: text("Activo", "Active"),
                        value: String(u.enabled),
                        options: yesNo,
                      },
                      {
                        name: "expires",
                        label: text("Vencimiento", "Expiry"),
                        type: "datetime-local",
                        value: dateInput(u.expiresAt),
                      },
                    ]}
                    submit={text(
                      "Guardar y revocar sesiones",
                      "Save and revoke sessions",
                    )}
                    onSubmit={(v) =>
                      run({
                        action: "user.update",
                        id: u.id,
                        role:
                          fieldValue(v, "role") === "admin"
                            ? "admin"
                            : "evaluator",
                        enabled: enabled(v, "enabled"),
                        expiresAt: fieldDate(v, "expires"),
                      })
                    }
                  />
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() =>
                      void run({ action: "user.recover", id: u.id }).catch(
                        () => {},
                      )
                    }
                  >
                    {text(
                      "Enviar activación / recuperación",
                      "Send activation / recovery",
                    )}
                  </Button>
                </div>
              </details>,
            ],
          }))}
        />
      </PanelCard>
      <PanelCard
        title={text("Capacidad y límites", "Capacity and limits")}
        description={text(
          "La capacidad no aumenta la concurrencia. Los límites técnicos de EVE siguen siendo una cota adicional.",
          "Capacity does not increase concurrency. EVE technical limits remain an additional ceiling.",
        )}
      >
        <ControlForm
          fields={Object.entries(data.settings).map(([name, value]) => ({
            name,
            label:
              (
                {
                  capacity: "Cuentas / Accounts",
                  globalConcurrency:
                    "Generaciones globales / Global generations",
                  userConcurrency: "Por usuario / Per user",
                  requestsPerMinute: "Solicitudes/minuto",
                  requestsPerDay: "Solicitudes/día",
                  inputTokensPerSession: "Tokens entrada/sesión",
                  outputTokensPerSession: "Tokens salida/sesión",
                  outputTokensPerCall: "Tokens salida/llamada",
                } as Record<string, string>
              )[name] ?? name,
            type: "number",
            value,
            min: 1,
            ...(name === "userConcurrency" ? { max: 5 } : {}),
          }))}
          submit={text("Guardar límites", "Save limits")}
          onSubmit={(v) =>
            run({
              action: "settings.update",
              settings: {
                capacity: fieldNumber(v, "capacity"),
                globalConcurrency: fieldNumber(v, "globalConcurrency"),
                userConcurrency: fieldNumber(v, "userConcurrency"),
                requestsPerMinute: fieldNumber(v, "requestsPerMinute"),
                requestsPerDay: fieldNumber(v, "requestsPerDay"),
                inputTokensPerSession: fieldNumber(v, "inputTokensPerSession"),
                outputTokensPerSession: fieldNumber(
                  v,
                  "outputTokensPerSession",
                ),
                outputTokensPerCall: fieldNumber(v, "outputTokensPerCall"),
              },
            })
          }
        />
      </PanelCard>
    </div>
  );
}

export function CatalogPanel({ data, run }: Props) {
  const { text } = useControlText();
  const [discovered, setDiscovered] = useState<string[]>([]);
  const modelFields: FormField[] = [
    {
      name: "providerId",
      label: text("Proveedor", "Provider"),
      options: data.providers.map((p) => ({ value: p.id, label: p.name })),
    },
    { name: "modelId", label: text("ID exacto del modelo", "Exact model ID") },
    { name: "name", label: text("Nombre", "Name") },
    {
      name: "protocol",
      label: text("Protocolo", "Protocol"),
      options: [
        { value: "chat-completions", label: "Chat Completions" },
        { value: "responses", label: "Responses" },
      ],
    },
    {
      name: "contextTokens",
      label: text(
        "Ventana de trabajo verificada (tokens)",
        "Verified working context (tokens)",
      ),
      type: "number",
      min: 1024,
      max: 2_000_000,
    },
    {
      name: "maxOutputTokens",
      label: text("Salida máxima verificada", "Verified maximum output"),
      type: "number",
      min: 1,
      max: 100_000,
    },
    {
      name: "ready",
      label: text(
        "Herramientas y streaming verificados",
        "Tools and streaming verified",
      ),
      options: [...yesNo].reverse(),
    },
    {
      name: "includeUsage",
      label: "stream_options.include_usage",
      options: yesNo,
    },
    {
      name: "parameters",
      label: text(
        "Parámetros admitidos, separados por coma",
        "Supported parameters, comma-separated",
      ),
      required: false,
      hint: "temperature, top_p, stop, seed, parallel_tool_calls, frequency_penalty, presence_penalty, reasoning, reasoning_effort, text",
    },
    {
      name: "outputTokenParameter",
      label: text(
        "Límite de salida Chat Completions",
        "Chat Completions output limit",
      ),
      options: [
        { value: "max_tokens", label: "max_tokens" },
        { value: "max_completion_tokens", label: "max_completion_tokens" },
      ],
    },
    {
      name: "reasoning",
      label: text("Razonamiento", "Reasoning"),
      options: [
        { value: "none", label: "Estándar / Standard" },
        { value: "deepseek", label: "DeepSeek thinking" },
      ],
    },
    ...(["input", "output", "cache"] as const).map((n) => ({
      name: n,
      label: `USD / 1M ${n} tokens`,
      type: "number" as const,
      min: 0,
      step: "0.000001",
      required: false,
    })),
    {
      name: "pricesValidUntil",
      label: text("Precios válidos hasta", "Prices valid until"),
      type: "datetime-local",
      required: false,
    },
  ];
  return (
    <div className="grid gap-6">
      <PanelCard
        title={text("Proveedores autorizados", "Authorized providers")}
        description={text(
          "Un destino no se edita: crea otro perfil para evitar redirigir keys existentes.",
          "Destinations are immutable: create another profile rather than redirect existing keys.",
        )}
      >
        <DataTable
          headings={[
            text("Proveedor", "Provider"),
            "URL",
            text("Estado", "Status"),
          ]}
          rows={data.providers.map((p) => ({
            id: p.id,
            cells: [
              p.name,
              p.baseUrl,
              <Button
                key="toggle"
                variant="outline"
                onClick={() =>
                  void run({
                    action: "provider.toggle",
                    id: p.id,
                    enabled: !p.enabled,
                  }).catch(() => {})
                }
              >
                {p.enabled
                  ? text("Desactivar", "Disable")
                  : text("Habilitar", "Enable")}
              </Button>,
            ],
          }))}
        />
        <details className="mt-4">
          <summary className="cursor-pointer">
            {text("Añadir endpoint HTTPS", "Add HTTPS endpoint")}
          </summary>
          <div className="pt-4">
            <ControlForm
              fields={[
                { name: "name", label: text("Nombre", "Name") },
                { name: "baseUrl", label: "Base URL (HTTPS)" },
                {
                  name: "protocol",
                  label: text("Protocolo", "Protocol"),
                  options: [
                    { value: "chat-completions", label: "Chat Completions" },
                    { value: "responses", label: "Responses" },
                    { value: "both", label: "Ambos / Both" },
                  ],
                },
                {
                  name: "authentication",
                  label: text("Autenticación", "Authentication"),
                  options: [
                    { value: "bearer", label: "Authorization: Bearer" },
                    { value: "api-key", label: "api-key" },
                  ],
                },
                { name: "modelList", label: "GET /models", options: yesNo },
              ]}
              submit={text("Crear desactivado", "Create disabled")}
              onSubmit={(v) =>
                run({
                  action: "provider.create",
                  provider: {
                    name: fieldValue(v, "name"),
                    baseUrl: fieldValue(v, "baseUrl"),
                    protocols:
                      fieldValue(v, "protocol") === "both"
                        ? ["chat-completions", "responses"]
                        : fieldValue(v, "protocol") === "responses"
                          ? ["responses"]
                          : ["chat-completions"],
                    authentication:
                      fieldValue(v, "authentication") === "api-key"
                        ? "api-key"
                        : "bearer",
                    modelList: enabled(v, "modelList"),
                  },
                })
              }
            />
          </div>
        </details>
      </PanelCard>
      <PanelCard
        title={text("Descubrir identificadores", "Discover model identifiers")}
        description={text(
          "Consulta externa explícita sin generar contenido. Los IDs no habilitan capacidades ni tarifas automáticamente.",
          "Explicit external query without content generation. IDs do not automatically enable capabilities or prices.",
        )}
      >
        <ControlForm
          fields={[
            {
              name: "credential",
              label: text("Credencial propia", "Own credential"),
              options: data.credentials
                .filter(
                  (c) =>
                    c.ownerId === data.identity.id && !c.deleted && c.enabled,
                )
                .map((c) => ({ value: c.id, label: c.alias })),
            },
          ]}
          submit={text("Consultar /models", "Query /models")}
          disabled={
            !data.credentials.some(
              (c) => c.ownerId === data.identity.id && c.enabled && !c.deleted,
            )
          }
          onSubmit={async (v) => {
            const result = await controlRequest<{
              models: Array<{ id: string; status: string }>;
            }>({
              action: "models.discover",
              credentialId: fieldValue(v, "credential"),
            });
            setDiscovered(result.models.map((m) => m.id));
          }}
        />
        {discovered.length ? (
          <pre className="mt-4 max-h-48 overflow-auto text-xs">
            {discovered.join("\n")}
          </pre>
        ) : null}
      </PanelCard>
      <PanelCard
        title={text(
          "Registrar modelo o nueva versión",
          "Register model or new version",
        )}
        description={text(
          "Configuración explícita. No ejecuta inferencias de prueba. Verifica capacidades y límites en la documentación del proveedor; una versión anterior no cambia.",
          "Explicit configuration. Does not run test inference. Verify provider capabilities and limits in its documentation; prior versions remain immutable.",
        )}
      >
        <ControlForm
          fields={modelFields}
          submit={text("Registrar", "Register")}
          onSubmit={(v) => {
            const pricing = (n: string) =>
              fieldValue(v, n) === "" ? null : usd(v, n);
            const model: Omit<ModelProfile, "id" | "version" | "enabled"> = {
              providerId: fieldValue(v, "providerId"),
              modelId: fieldValue(v, "modelId"),
              name: fieldValue(v, "name"),
              protocol:
                fieldValue(v, "protocol") === "responses"
                  ? "responses"
                  : "chat-completions",
              contextTokens: fieldNumber(v, "contextTokens"),
              maxOutputTokens: fieldNumber(v, "maxOutputTokens"),
              tools: enabled(v, "ready"),
              streaming: enabled(v, "ready"),
              ready: enabled(v, "ready"),
              includeUsage: enabled(v, "includeUsage"),
              reasoning:
                fieldValue(v, "reasoning") === "deepseek" ? "deepseek" : "none",
              outputTokenParameter:
                fieldValue(v, "outputTokenParameter") ===
                "max_completion_tokens"
                  ? "max_completion_tokens"
                  : "max_tokens",
              parameters: fieldValue(v, "parameters")
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean) as ModelProfile["parameters"],
              inputMicrosPerMillion: pricing("input"),
              outputMicrosPerMillion: pricing("output"),
              cacheMicrosPerMillion: pricing("cache"),
              pricesValidUntil: fieldValue(v, "pricesValidUntil")
                ? fieldDate(v, "pricesValidUntil")
                : null,
            };
            return run({ action: "model.create", model });
          }}
        />
      </PanelCard>
      <PanelCard title={text("Modelos y versiones", "Models and versions")}>
        <DataTable
          headings={[
            text("Modelo", "Model"),
            text("Contexto / salida", "Context / output"),
            text("Estado", "Status"),
          ]}
          rows={data.models.map((m) => ({
            id: m.id,
            cells: [
              `${m.name} · ${m.modelId} · v${m.version} · ${m.protocol}`,
              `${m.contextTokens} / ${m.maxOutputTokens}`,
              <Button
                key="toggle"
                variant="outline"
                disabled={!m.ready}
                onClick={() =>
                  void run({
                    action: "model.toggle",
                    id: m.id,
                    enabled: !m.enabled,
                  }).catch(() => {})
                }
              >
                {!m.ready
                  ? text("Pendiente", "Pending")
                  : m.enabled
                    ? text("Desactivar", "Disable")
                    : text("Habilitar", "Enable")}
              </Button>,
            ],
          }))}
        />
      </PanelCard>
    </div>
  );
}

export function SponsorshipPanel({ data, run }: Props) {
  const { text, money } = useControlText();
  const grantFields = (g?: ControlSnapshot["grants"][number]): FormField[] => [
    {
      name: "userId",
      label: text("Beneficiario", "Beneficiary"),
      ...(g ? { value: g.userId } : {}),
      options: data.users.map((u) => ({ value: u.id, label: u.email })),
    },
    {
      name: "poolId",
      label: text("Bolsa", "Pool"),
      ...(g ? { value: g.poolId } : {}),
      options: data.pools.map((p) => ({ value: p.id, label: p.name })),
    },
    {
      name: "models",
      label: text(
        "IDs de versiones de modelos, separados por coma",
        "Model version IDs, comma-separated",
      ),
      value: g?.modelIds.join(",") ?? "",
    },
    moneyField(
      "budget",
      text("Presupuesto obligatorio USD", "Required USD budget"),
      g?.budgetMicros,
    ),
    {
      name: "expires",
      label: text("Vencimiento", "Expiry"),
      type: "datetime-local",
      value: g ? dateInput(g.expiresAt) : future(),
    },
    {
      name: "input",
      label: text("Límite tokens entrada", "Input token limit"),
      type: "number",
      min: 1,
      value: g?.inputTokenLimit ?? 100_000,
    },
    {
      name: "output",
      label: text("Límite tokens salida", "Output token limit"),
      type: "number",
      min: 1,
      value: g?.outputTokenLimit ?? 10_000,
    },
    {
      name: "calls",
      label: text("Límite llamadas", "Call limit"),
      type: "number",
      min: 1,
      value: g?.callLimit ?? 30,
    },
    {
      name: "concurrency",
      label: text("Concurrencia", "Concurrency"),
      type: "number",
      min: 1,
      max: 5,
      value: g?.concurrencyLimit ?? 1,
    },
    ...(g
      ? [
          {
            name: "enabled",
            label: text("Activo", "Active"),
            options: yesNo,
            value: String(g.enabled),
          },
        ]
      : []),
  ];
  const grant = (v: FormData) => ({
    userId: fieldValue(v, "userId"),
    poolId: fieldValue(v, "poolId"),
    modelIds: fieldValue(v, "models")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    budgetMicros: usd(v, "budget"),
    expiresAt: fieldDate(v, "expires"),
    inputTokenLimit: fieldNumber(v, "input"),
    outputTokenLimit: fieldNumber(v, "output"),
    callLimit: fieldNumber(v, "calls"),
    concurrencyLimit: fieldNumber(v, "concurrency"),
  });
  return (
    <div className="grid gap-6">
      <PanelCard
        title={text("Nueva bolsa patrocinadora", "New sponsorship pool")}
        description={text(
          "La key no se comparte con los beneficiarios. Sin recargas ni renovaciones automáticas.",
          "The key is not shared with beneficiaries. No automatic top-ups or renewals.",
        )}
      >
        <ControlForm
          disabled={
            !data.credentials.some(
              (c) =>
                c.origin === "admin" &&
                c.enabled &&
                !c.deleted &&
                c.ownerId === data.identity.id,
            )
          }
          fields={[
            {
              name: "credential",
              label: text(
                "Credencial administradora propia",
                "Own administrator credential",
              ),
              options: data.credentials
                .filter(
                  (c) =>
                    c.origin === "admin" &&
                    c.enabled &&
                    !c.deleted &&
                    c.ownerId === data.identity.id,
                )
                .map((c) => ({ value: c.id, label: c.alias })),
            },
            { name: "name", label: text("Nombre", "Name") },
            moneyField(
              "budget",
              text("Presupuesto total USD", "Total USD budget"),
            ),
            {
              name: "expires",
              label: text("Vencimiento", "Expiry"),
              type: "datetime-local",
              value: future(),
            },
          ]}
          submit={text("Crear bolsa", "Create pool")}
          onSubmit={(v) =>
            run({
              action: "pool.create",
              credentialId: fieldValue(v, "credential"),
              name: fieldValue(v, "name"),
              budgetMicros: usd(v, "budget"),
              expiresAt: fieldDate(v, "expires"),
            })
          }
        />
      </PanelCard>
      {data.pools.map((p) => (
        <PanelCard
          key={p.id}
          title={p.name}
          description={`${text("Consumido / reservado", "Consumed / reserved")}: ${money(p.usedMicros)} / ${money(p.reservedMicros)}`}
        >
          <ControlForm
            fields={[
              moneyField(
                "budget",
                text("Presupuesto USD", "USD budget"),
                p.budgetMicros,
              ),
              {
                name: "expires",
                label: text("Vencimiento", "Expiry"),
                type: "datetime-local",
                value: dateInput(p.expiresAt),
              },
              {
                name: "enabled",
                label: text("Activo", "Active"),
                options: yesNo,
                value: String(p.enabled),
              },
            ]}
            submit={text("Actualizar bolsa", "Update pool")}
            onSubmit={(v) =>
              run({
                action: "pool.update",
                id: p.id,
                budgetMicros: usd(v, "budget"),
                expiresAt: fieldDate(v, "expires"),
                enabled: enabled(v, "enabled"),
              })
            }
          />
        </PanelCard>
      ))}
      <PanelCard
        title={text(
          "Modelos elegibles: referencias para patrocinios",
          "Eligible models: sponsorship references",
        )}
      >
        <DataTable
          headings={[text("Modelo", "Model"), "ID"]}
          rows={data.models
            .filter(
              (m) =>
                m.ready &&
                m.enabled &&
                m.pricesValidUntil &&
                Date.parse(m.pricesValidUntil) > Date.now(),
            )
            .map((m) => ({
              id: m.id,
              cells: [
                m.name,
                <code key="id" className="text-xs select-all">
                  {m.id}
                </code>,
              ],
            }))}
        />
      </PanelCard>
      <PanelCard title={text("Conceder patrocinio", "Grant sponsorship")}>
        <ControlForm
          disabled={!data.pools.length || !data.users.length}
          fields={grantFields()}
          submit={text("Conceder acceso", "Grant access")}
          onSubmit={(v) => run({ action: "grant.create", grant: grant(v) })}
        />
      </PanelCard>
      {data.grants.map((g) => (
        <PanelCard
          key={g.id}
          title={`${text("Acceso", "Access")} · ${data.users.find((u) => u.id === g.userId)?.email ?? g.userId}`}
          description={`${money(g.usedMicros)} + ${money(g.reservedMicros)} / ${money(g.budgetMicros)}`}
        >
          <ControlForm
            fields={grantFields(g)}
            submit={text("Actualizar acceso", "Update access")}
            onSubmit={(v) =>
              run({
                action: "grant.update",
                id: g.id,
                grant: grant(v),
                enabled: enabled(v, "enabled"),
              })
            }
          />
        </PanelCard>
      ))}
    </div>
  );
}
