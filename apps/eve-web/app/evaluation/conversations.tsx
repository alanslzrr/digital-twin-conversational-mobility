"use client";

import { type ConversationPage, conversationPage } from "@mobility/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function Conversations() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Mis conversaciones
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mis conversaciones</DialogTitle>
          <DialogDescription>
            Solo conversaciones con acceso vigente. Fecha de creación, no de
            última actividad. El acceso caduca normalmente a los siete días; los
            mensajes dependen del almacenamiento de EVE.
          </DialogDescription>
        </DialogHeader>
        {open ? <ConversationList /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ConversationList() {
  const [page, setPage] = useState<ConversationPage>({
    sessions: [],
    nextCursor: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const load = useCallback(async (cursor: ConversationPage["nextCursor"]) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(
        `/api/evaluation/conversations${cursor ? `?cursor=${encodeURIComponent(JSON.stringify(cursor))}` : ""}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (!response.ok) throw new Error("unavailable");
      const result = conversationPage.parse(await response.json());
      if (controller.signal.aborted) return;
      setPage((previous) => ({
        ...result,
        sessions: cursor
          ? [
              ...previous.sessions,
              ...result.sessions.filter(
                (item) =>
                  !previous.sessions.some(
                    (existing) => existing.sessionId === item.sessionId,
                  ),
              ),
            ]
          : result.sessions,
      }));
      setLoaded(true);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  // Mount only while open: reopening refreshes the index; no polling or messages.
  useEffect(() => {
    void load(null);
    return () => pending.current?.abort();
  }, [load]);
  return (
    <div className="flex flex-col gap-3">
      <Button asChild variant="outline">
        <a href="/s">Nuevo chat</a>
      </Button>
      <ul className="flex flex-col gap-2">
        {page.sessions.map((session) => (
          <li key={session.sessionId}>
            <Button asChild variant="ghost" className="w-full justify-start">
              <a href={`/s/${encodeURIComponent(session.sessionId)}`}>
                Conversación ·{" "}
                <time dateTime={session.createdAt}>
                  {new Date(session.createdAt).toLocaleString("es-ES")}
                </time>
              </a>
            </Button>
          </li>
        ))}
      </ul>
      {loading ? <p role="status">Cargando conversaciones…</p> : null}
      {error ? (
        <div role="alert">
          <p>No se pudieron cargar las conversaciones.</p>
          <Button
            variant="outline"
            onClick={() => void load(loaded ? page.nextCursor : null)}
          >
            Reintentar
          </Button>
        </div>
      ) : null}
      {loaded && !loading && !error && page.sessions.length === 0 ? (
        <p>No tienes conversaciones con acceso vigente.</p>
      ) : null}
      {!error && page.nextCursor ? (
        <Button
          disabled={loading}
          variant="outline"
          onClick={() => void load(page.nextCursor)}
        >
          Cargar más
        </Button>
      ) : null}
    </div>
  );
}
