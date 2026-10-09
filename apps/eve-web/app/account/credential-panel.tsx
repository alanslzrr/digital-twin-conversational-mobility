"use client";
import type { ControlAction, ControlSnapshot } from "@mobility/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ControlForm,
  DataTable,
  fieldValue,
  PanelCard,
  useControlText,
} from "./control-ui";

export function CredentialPanel({
  data,
  run,
  admin,
}: {
  data: ControlSnapshot;
  run: (action: ControlAction) => Promise<void>;
  admin: boolean;
}) {
  const { text } = useControlText();
  return (
    <div className="flex flex-col gap-6">
      <PanelCard
        title={text("Añadir credencial", "Add credential")}
        description={text(
          "Solo escritura. Para financiar pruebas con límites, utiliza una bolsa y un patrocinio.",
          "Write-only. Use a funding pool and grant to sponsor trials with limits.",
        )}
      >
        <ControlForm
          fields={[
            {
              name: "provider",
              label: text("Proveedor", "Provider"),
              options: data.providers.map((p) => ({
                value: p.id,
                label: p.name,
              })),
            },
            {
              name: "alias",
              label: text("Nombre de la credencial", "Credential name"),
            },
            { name: "secret", label: "API key", type: "password" },
            ...(admin
              ? [
                  {
                    name: "owner",
                    label: text("Propietario", "Owner"),
                    value: data.identity.id,
                    options: data.users.map((u) => ({
                      value: u.id,
                      label: `${u.label} · ${u.email}`,
                    })),
                  },
                ]
              : []),
          ]}
          submit={text("Guardar credencial", "Save credential")}
          onSubmit={(v) =>
            run({
              action: "credential.create",
              providerId: fieldValue(v, "provider"),
              alias: fieldValue(v, "alias"),
              secret: fieldValue(v, "secret"),
              ...(admin ? { ownerId: fieldValue(v, "owner") } : {}),
            })
          }
        />
      </PanelCard>
      <PanelCard
        title={text("Credenciales guardadas", "Saved credentials")}
        description={text(
          "Eliminar aquí no revoca la key en el proveedor. Reemplazarla bloquea los turnos que usaban la versión anterior.",
          "Deleting here does not revoke the provider key. Replacing it blocks turns bound to its previous version.",
        )}
      >
        <DataTable
          headings={[
            text("Credencial", "Credential"),
            text("Proveedor / propietario", "Provider / owner"),
            text("Estado", "Status"),
            text("Acciones", "Actions"),
          ]}
          rows={data.credentials.map((key) => ({
            id: key.id,
            cells: [
              <div key="name">
                <p>{key.alias}</p>
                <code className="text-xs">
                  {key.fingerprint} · v{key.version}
                </code>
              </div>,
              `${data.providers.find((p) => p.id === key.providerId)?.name ?? "—"} / ${data.users.find((u) => u.id === key.ownerId)?.label ?? data.identity.label}`,
              <Badge key="state" variant="outline">
                {key.deleted
                  ? text("Eliminada", "Deleted")
                  : key.enabled
                    ? text("Activa", "Active")
                    : text("Desactivada", "Disabled")}
              </Badge>,
              !key.deleted ? (
                <div key="actions" className="flex flex-col gap-3">
                  <Button
                    variant="outline"
                    onClick={() =>
                      void run({
                        action: "credential.toggle",
                        id: key.id,
                        enabled: !key.enabled,
                      }).catch(() => {})
                    }
                  >
                    {key.enabled
                      ? text("Desactivar", "Disable")
                      : text("Activar", "Enable")}
                  </Button>
                  <ControlForm
                    fields={[
                      {
                        name: "secret",
                        label: text("Nueva API key", "New API key"),
                        type: "password",
                      },
                    ]}
                    submit={text("Reemplazar", "Replace")}
                    onSubmit={(v) =>
                      run({
                        action: "credential.replace",
                        id: key.id,
                        secret: fieldValue(v, "secret"),
                      })
                    }
                  />
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (
                        window.confirm(
                          text(
                            "¿Eliminar esta credencial de mobai?",
                            "Delete this credential from mobai?",
                          ),
                        )
                      )
                        void run({
                          action: "credential.delete",
                          id: key.id,
                        }).catch(() => {});
                    }}
                  >
                    {text("Eliminar", "Delete")}
                  </Button>
                </div>
              ) : (
                "—"
              ),
            ],
          }))}
        />
      </PanelCard>
    </div>
  );
}
