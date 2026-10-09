"use client";
import { useState } from "react";
import {
  ModelSettingsSelector,
  useModelSelection,
} from "@/app/_components/model-selector";
import { Button } from "@/components/ui/button";
import { errorText, PanelCard, useControlText } from "./control-ui";

export function SelectionDefault() {
  const selection = useModelSelection();
  const { text, locale } = useControlText();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  return (
    <PanelCard
      title={text("Selección predeterminada", "Default selection")}
      description={text(
        "Se utiliza al abrir una conversación nueva. No cambia turnos existentes ni valida la key mediante una inferencia.",
        "Used for new conversations. It does not change existing turns or validate the key through inference.",
      )}
    >
      <ModelSettingsSelector
        selection={selection}
        disabled={busy}
        canCompact={false}
        onCompact={async () => {}}
      />
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          setSaved(false);
          try {
            await selection.prepare(false);
            setSaved(true);
          } catch (e) {
            setError(errorText(e, locale));
          } finally {
            setBusy(false);
          }
        }}
      >
        {text("Guardar selección", "Save selection")}
      </Button>
      {saved ? (
        <p role="status" className="mt-4 text-sm">
          {text("Selección guardada.", "Selection saved.")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </PanelCard>
  );
}
