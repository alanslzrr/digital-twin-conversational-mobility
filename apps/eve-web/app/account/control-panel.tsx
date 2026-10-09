"use client";
import type { ControlAction, ControlSnapshot } from "@mobility/contracts";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CatalogPanel, SponsorshipPanel, UsersPanel } from "./admin-panels";
import {
  controlRequest,
  DataTable,
  errorText,
  PanelCard,
  useControlText,
} from "./control-ui";
import { CredentialPanel } from "./credential-panel";
import { SecurityPanel } from "./security-panel";
import { SelectionDefault } from "./selection-default";
import { UsagePanel } from "./usage-panel";

export function ControlPanel({ admin = false }: { admin?: boolean }) {
  const { text, locale } = useControlText();
  const [data, setData] = useState<ControlSnapshot | null>(null),
    [error, setError] = useState("");
  const reload = useCallback(async () => {
    const next = await controlRequest<ControlSnapshot>({
      action: "snapshot",
      admin,
    });
    setData(next);
  }, [admin]);
  useEffect(() => {
    const controller = new AbortController();
    void controlRequest<ControlSnapshot>(
      { action: "snapshot", admin },
      controller.signal,
    )
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e, locale));
      });
    return () => controller.abort();
  }, [admin, locale]);
  async function run(action: ControlAction) {
    setError("");
    try {
      await controlRequest(action);
      await reload();
    } catch (e) {
      setError(errorText(e, locale));
      throw e;
    }
  }
  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl px-4 pt-24 pb-12 sm:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-medium">
          {admin
            ? text("Administración", "Administration")
            : text("Mi cuenta", "My account")}
        </h1>
        <nav className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href="/s">{text("Conversar", "Chat")}</a>
          </Button>
          <Button asChild variant="outline">
            <a href={admin ? "/account" : "/admin"}>
              {admin
                ? text("Mi cuenta / TOTP", "My account / TOTP")
                : text("Administración", "Administration")}
            </a>
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              void reload().catch((e) => setError(errorText(e, locale)))
            }
          >
            {text("Actualizar", "Refresh")}
          </Button>
        </nav>
      </header>
      {error ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {data ? (
        <>
          <p className="mb-6 text-sm text-muted-foreground">
            {data.identity.email} · {data.identity.role} ·{" "}
            {data.identity.reauthenticated
              ? text(
                  "Cambios administrativos autorizados temporalmente",
                  "Administrative changes temporarily authorized",
                )
              : text(
                  "Las operaciones sensibles requieren reautenticación en Seguridad",
                  "Sensitive operations require reauthentication in Security",
                )}
          </p>
          <Tabs defaultValue={admin ? "users" : "usage"}>
            <TabsList className="mb-6 flex h-auto flex-wrap justify-start">
              {admin ? (
                <>
                  <TabsTrigger value="users">
                    {text("Cuentas", "Accounts")}
                  </TabsTrigger>
                  <TabsTrigger value="catalog">
                    {text("Catálogo", "Catalog")}
                  </TabsTrigger>
                  <TabsTrigger value="sponsors">
                    {text("Patrocinios", "Sponsorship")}
                  </TabsTrigger>
                </>
              ) : null}
              <TabsTrigger value="keys">
                {text("Credenciales", "Credentials")}
              </TabsTrigger>
              <TabsTrigger value="usage">
                {text("Consumo", "Usage")}
              </TabsTrigger>
              <TabsTrigger value="selection">
                {text("Modelo predeterminado", "Default model")}
              </TabsTrigger>
              <TabsTrigger value="security">
                {text("Seguridad", "Security")}
              </TabsTrigger>
              {admin ? (
                <TabsTrigger value="operations">
                  {text("Operaciones", "Operations")}
                </TabsTrigger>
              ) : null}
            </TabsList>
            {admin ? (
              <>
                <TabsContent value="users">
                  <UsersPanel data={data} run={run} />
                </TabsContent>
                <TabsContent value="catalog">
                  <CatalogPanel data={data} run={run} />
                </TabsContent>
                <TabsContent value="sponsors">
                  <SponsorshipPanel data={data} run={run} />
                </TabsContent>
              </>
            ) : null}
            <TabsContent value="keys">
              <CredentialPanel data={data} run={run} admin={admin} />
            </TabsContent>
            <TabsContent value="usage">
              <UsagePanel data={data} run={run} admin={admin} />
            </TabsContent>
            <TabsContent value="selection">
              <SelectionDefault />
            </TabsContent>
            <TabsContent value="security">
              <SecurityPanel data={data} run={run} reload={reload} />
            </TabsContent>
            {admin ? (
              <TabsContent value="operations" className="grid gap-6">
                <PanelCard
                  title={text("Correo transaccional", "Transactional email")}
                  description={text(
                    "Aceptado no significa entregado. Los reintentos son explícitos y acotados; los enlaces caducados requieren otra invitación.",
                    "Accepted does not mean delivered. Retries are explicit and bounded; expired links require a new invitation.",
                  )}
                >
                  <DataTable
                    headings={[
                      text("Cuenta", "Account"),
                      text("Estado", "State"),
                      text("Intentos", "Attempts"),
                      "",
                    ]}
                    rows={data.mail.map((m) => ({
                      id: m.id,
                      cells: [
                        data.users.find((u) => u.id === m.userId)?.email ??
                          m.userId,
                        m.state,
                        m.attempts,
                        <Button
                          key="retry"
                          variant="outline"
                          disabled={
                            !["pending", "failed"].includes(m.state) ||
                            m.attempts >= 3
                          }
                          onClick={() =>
                            void run({ action: "mail.retry", id: m.id }).catch(
                              () => {},
                            )
                          }
                        >
                          {text("Reintentar", "Retry")}
                        </Button>,
                      ],
                    }))}
                  />
                </PanelCard>
                <PanelCard
                  title={text(
                    "Registro administrativo (últimos 200)",
                    "Administrative audit (latest 200)",
                  )}
                >
                  <DataTable
                    headings={[
                      text("Fecha", "Date"),
                      text("Actor", "Actor"),
                      text("Operación", "Operation"),
                      text("Referencia", "Reference"),
                      text("Cambios", "Changes"),
                    ]}
                    rows={data.audit.map((a) => ({
                      id: a.id,
                      cells: [
                        new Date(a.createdAt).toLocaleString(),
                        a.actorId,
                        a.action,
                        a.targetId,
                        JSON.stringify(a.details),
                      ],
                    }))}
                  />
                </PanelCard>
              </TabsContent>
            ) : null}
          </Tabs>
        </>
      ) : !error ? (
        <p role="status">{text("Cargando…", "Loading…")}</p>
      ) : null}
    </main>
  );
}
