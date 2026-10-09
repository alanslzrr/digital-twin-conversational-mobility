"use client";
import type { ControlSnapshot, TurnBinding } from "@mobility/contracts";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  controlRequest,
  errorText,
  UiControlError,
  useControlText,
} from "@/app/account/control-ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Current = {
  selectionId: string | null;
  binding?: TurnBinding;
  status?: string;
};
export function useModelSelection(initialSessionId?: string) {
  const { locale, text } = useControlText();
  const [data, setData] = useState<ControlSnapshot | null>(null),
    [modelId, setModelId] = useState(""),
    [funding, setFunding] = useState(""),
    [error, setError] = useState("");
  const selection = useRef<string | null>(null),
    session = useRef(initialSessionId),
    previous = useRef<TurnBinding | null>(null),
    loading = useRef<Promise<void> | null>(null),
    consentProvider = useRef<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    loading.current = (async () => {
      const [snapshot, current] = await Promise.all([
        controlRequest<ControlSnapshot>(
          { action: "snapshot", admin: false },
          abort.signal,
        ),
        initialSessionId
          ? controlRequest<Current>(
              { action: "selection.current", sessionId: initialSessionId },
              abort.signal,
            )
          : Promise.resolve<Current>({ selectionId: null }),
      ]);
      if (abort.signal.aborted) return;
      consentProvider.current = null;
      setData(snapshot);
      selection.current = current.selectionId;
      previous.current = current.binding ?? null;
      const choice = current.binding ?? snapshot.preference;
      if (choice) {
        setModelId("model" in choice ? choice.model.id : choice.modelId);
        setFunding(
          choice.grantId
            ? `grant:${choice.grantId}`
            : `credential:${choice.credentialId}`,
        );
      }
    })().catch((e) => {
      if (!abort.signal.aborted) setError(errorText(e, locale));
    });
    return () => abort.abort();
  }, [initialSessionId, locale]);
  async function prepare(continuing: boolean) {
    await loading.current;
    setError("");
    if (continuing) {
      if (!selection.current) throw new UiControlError("operation_conflict");
      return;
    }
    if (!modelId || !funding) throw new UiControlError("model_denied");
    const model = data?.models.find((m) => m.id === modelId);
    if (!model) throw new UiControlError("model_denied");
    const changing = Boolean(
      session.current &&
        (!previous.current || previous.current.providerId !== model.providerId),
    );
    if (
      changing &&
      consentProvider.current !== model.providerId &&
      !window.confirm(
        text(
          `El contexto necesario de esta conversación se enviará a ${data?.providers.find((p) => p.id === model.providerId)?.name ?? "otro proveedor"}. ¿Continuar?`,
          `The necessary conversation context will be sent to ${data?.providers.find((p) => p.id === model.providerId)?.name ?? "another provider"}. Continue?`,
        ),
      )
    )
      throw new UiControlError("provider_consent_required");
    const [kind, id] = funding.split(":");
    const result = await controlRequest<{ selectionId: string }>({
      action: "selection.prepare",
      selection: {
        modelId,
        ...(kind === "grant"
          ? { grantId: id ?? "" }
          : { credentialId: id ?? "" }),
        ...(session.current ? { sessionId: session.current } : {}),
        confirmProviderChange: changing,
      },
    });
    selection.current = result.selectionId;
  }
  return {
    data,
    modelId,
    funding,
    setModelId,
    setFunding,
    error,
    prepare,
    chooseModel: (id: string, nextFunding: string) => {
      if (!supportsSelection(data, id, nextFunding)) return;
      const model = data?.models.find((m) => m.id === id);
      if (!model) return;
      const provider = data?.providers.find((p) => p.id === model.providerId);
      const connection = availableConnections(data, id).find(
        (c) => c.value === nextFunding,
      );
      const providerChanged = Boolean(
        session.current &&
          (!previous.current ||
            previous.current.providerId !== model.providerId),
      );
      const payerChanged = funding !== nextFunding;
      if (
        (providerChanged || payerChanged) &&
        !window.confirm(
          [
            text(
              `Usar ${model.name} con ${connection?.alias ?? "acceso patrocinado"} (${provider?.name ?? ""}).`,
              `Use ${model.name} with ${connection?.alias ?? "sponsored access"} (${provider?.name ?? ""}).`,
            ),
            providerChanged
              ? text(
                  "El contexto de esta conversación se enviará a este proveedor.",
                  "This conversation's context will be sent to this provider.",
                )
              : "",
            text("¿Continuar?", "Continue?"),
          ]
            .filter(Boolean)
            .join("\n"),
        )
      )
        return;
      consentProvider.current = providerChanged ? model.providerId : null;
      setModelId(id);
      setFunding(nextFunding);
      setError("");
    },
    headers: () =>
      selection.current ? { "x-mobai-selection": selection.current } : {},
    rememberSession: (id: string) => {
      session.current = id;
    },
    finished: () => {
      if (session.current)
        void controlRequest<Current>({
          action: "selection.current",
          sessionId: session.current,
        })
          .then((c) => {
            previous.current = c.binding ?? null;
            selection.current = c.selectionId;
          })
          .catch(() => {});
    },
  };
}
export function ModelSettingsSelector({
  selection,
  disabled,
  canCompact,
  onCompact,
}: {
  selection: ReturnType<typeof useModelSelection>;
  disabled: boolean;
  canCompact: boolean;
  onCompact: () => Promise<void>;
}) {
  const { text } = useControlText();
  const model = selection.data?.models.find((m) => m.id === selection.modelId);
  const own =
    selection.data?.credentials
      .filter(
        (c) => c.enabled && !c.deleted && c.providerId === model?.providerId,
      )
      .map((c) => ({
        value: `credential:${c.id}`,
        label: `${text("Propia", "Own")}: ${c.alias}`,
      })) ?? [];
  const sponsored =
    selection.data?.grants
      .filter(
        (g) =>
          g.status === "active" &&
          Date.parse(g.expiresAt) > Date.now() &&
          g.modelIds.includes(selection.modelId),
      )
      .map((g) => ({
        value: `grant:${g.id}`,
        label: `${text("Patrocinio", "Sponsorship")} · ${g.id.slice(0, 8)}`,
      })) ?? [];
  const funding = [...own, ...sponsored];
  return (
    <fieldset
      disabled={disabled}
      className="mb-3 flex flex-wrap items-end gap-2 text-xs"
    >
      <div className="min-w-40 flex-1">
        <Label htmlFor="mobai-model" className="mb-1 text-xs">
          {text("Proveedor / modelo", "Provider / model")}
        </Label>
        <Select
          value={selection.modelId}
          onValueChange={(id) => {
            selection.setModelId(id);
            selection.setFunding("");
          }}
          disabled={disabled}
        >
          <SelectTrigger id="mobai-model" className="h-8 w-full text-xs">
            <SelectValue
              placeholder={text("Selecciona modelo", "Select model")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {selection.data?.models
                .filter(
                  (m) =>
                    m.ready &&
                    m.enabled &&
                    selection.data?.providers.some(
                      (p) => p.id === m.providerId && p.enabled,
                    ),
                )
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {
                      selection.data?.providers.find(
                        (p) => p.id === m.providerId,
                      )?.name
                    }{" "}
                    / {m.name} · v{m.version}
                  </SelectItem>
                ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-36 flex-1">
        <Label htmlFor="mobai-funding" className="mb-1 text-xs">
          {text("Financiación", "Funding")}
        </Label>
        <Select
          value={selection.funding}
          onValueChange={selection.setFunding}
          disabled={disabled}
        >
          <SelectTrigger id="mobai-funding" className="h-8 w-full text-xs">
            <SelectValue
              placeholder={text("Selecciona financiación", "Select funding")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {funding.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <Button variant="ghost" size="sm" asChild>
        <a href="/account">{text("Configurar", "Settings")}</a>
      </Button>
      {canCompact ? (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => void onCompact()}
        >
          {text("Compactar antes de cambiar", "Compact before switching")}
        </Button>
      ) : null}
      {disabled ? (
        <p role="status" className="w-full text-muted-foreground">
          {text(
            "Selección fijada durante la ejecución o aprobación pendiente.",
            "Selection is pinned during execution or pending approval.",
          )}
        </p>
      ) : null}
      {selection.error ? (
        <p role="alert" className="w-full text-destructive">
          {selection.error}
        </p>
      ) : null}
    </fieldset>
  );
}

// Only metadata is used in the browser; Core rechecks ownership, status and budgets.
export function availableConnections(
  data: ControlSnapshot | null,
  modelId: string,
) {
  return [
    ...(data?.credentials.map((c) => ({
      value: `credential:${c.id}`,
      alias: c.alias,
    })) ?? []),
    ...(data?.grants.map((g) => ({ value: `grant:${g.id}`, alias: null })) ??
      []),
  ].filter((c) => supportsSelection(data, modelId, c.value));
}

export function supportsSelection(
  data: ControlSnapshot | null,
  modelId: string,
  funding: string,
): boolean {
  const model = data?.models.find((m) => m.id === modelId);
  if (
    !model?.ready ||
    !model.enabled ||
    !data?.providers.some((p) => p.id === model.providerId && p.enabled)
  )
    return false;
  return (
    data.credentials.some(
      (c) =>
        funding === `credential:${c.id}` &&
        c.enabled &&
        !c.deleted &&
        c.providerId === model.providerId,
    ) ||
    data.grants.some(
      (g) =>
        funding === `grant:${g.id}` &&
        g.status === "active" &&
        Date.parse(g.expiresAt) > Date.now() &&
        g.modelIds.includes(modelId),
    )
  );
}

export function ModelSelector({
  selection,
  disabled,
  canCompact,
  onCompact,
}: {
  selection: ReturnType<typeof useModelSelection>;
  disabled: boolean;
  canCompact: boolean;
  onCompact: () => Promise<void>;
}) {
  const { text } = useControlText();
  const model = selection.data?.models.find((m) => m.id === selection.modelId);
  const models =
    selection.data?.models
      .map((m) => ({
        ...m,
        connections: availableConnections(selection.data, m.id),
      }))
      .filter((m) => m.connections.length > 0) ?? [];
  const providers =
    selection.data?.providers.filter((p) =>
      models.some((m) => m.providerId === p.id),
    ) ?? [];
  function choose(id: string, connection: string) {
    if (!disabled) selection.chooseModel(id, connection);
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || !selection.data}
          aria-label={text("Cambiar modelo", "Change model")}
          className="absolute bottom-2.5 left-2.5 h-8 max-w-[calc(100%-4.5rem)] gap-1.5 px-2 text-xs text-muted-foreground"
        >
          <span className="truncate">
            {model?.name ?? text("Modelo", "Model")}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-64 max-w-[calc(100vw-2rem)]"
      >
        {providers.map((provider) => (
          <DropdownMenuGroup key={provider.id}>
            {providers.length > 1 ? (
              <DropdownMenuLabel>{provider.name}</DropdownMenuLabel>
            ) : null}
            {models
              .filter((m) => m.providerId === provider.id)
              .map((m) => {
                const current = m.connections.find(
                  (c) => c.value === selection.funding,
                );
                const connection =
                  current ??
                  (m.connections.length === 1 ? m.connections[0] : undefined);
                return connection ? (
                  <DropdownMenuItem
                    key={m.id}
                    disabled={disabled}
                    onSelect={() => choose(m.id, connection.value)}
                  >
                    <span className="flex-1 truncate">{m.name}</span>
                    {selection.modelId === m.id &&
                    selection.funding === connection.value ? (
                      <CheckIcon className="size-4" />
                    ) : null}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuSub key={m.id}>
                    <DropdownMenuSubTrigger disabled={disabled}>
                      {m.name}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {m.connections.map((c) => (
                        <DropdownMenuItem
                          key={c.value}
                          disabled={disabled}
                          onSelect={() => choose(m.id, c.value)}
                        >
                          {c.alias ??
                            `${text("Acceso patrocinado", "Sponsored access")} · ${c.value.slice(-6)}`}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                );
              })}
          </DropdownMenuGroup>
        ))}
        {models.length ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem asChild>
          <a href="/account">{text("Gestionar modelos", "Manage models")}</a>
        </DropdownMenuItem>
        {canCompact ? (
          <DropdownMenuItem
            onSelect={() => {
              if (!disabled) void onCompact();
            }}
          >
            {text("Compactar conversación", "Compact conversation")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
