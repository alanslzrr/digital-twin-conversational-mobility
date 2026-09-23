"use client";

import { useEveAgent } from "eve/react";
import { useEffect, useState } from "react";

type Identity = { principalId: string; label: string };
export function Evaluation() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/evaluation", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (response.ok) setIdentity(await response.json());
      })
      .catch(() => {
        /* Signed-out/offline state does not create a conversation. */
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (loading) return <p role="status">Comprobando acceso…</p>;
  if (identity)
    return (
      <Chat
        key={identity.principalId}
        identity={identity}
        onLogout={() => setIdentity(null)}
      />
    );
  return (
    <form
      className="evaluation-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setLoading(true);
        setError("");
        try {
          const result = await fetch("/api/auth/sign-in/email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: data.get("email"),
              password: data.get("password"),
            }),
          });
          if (!result.ok)
            throw new Error(
              "No se pudo iniciar sesión. Revisa las credenciales o espera un minuto.",
            );
          const access = await fetch("/api/evaluation", { cache: "no-store" });
          if (!access.ok)
            throw new Error(
              "La cuenta no está habilitada para esta evaluación.",
            );
          setIdentity(await access.json());
          form.reset();
        } catch (failure) {
          setError(
            failure instanceof Error ? failure.message : "No se pudo conectar.",
          );
        } finally {
          setLoading(false);
        }
      }}
    >
      <h2>Acceso de evaluadores</h2>
      <p>
        Usa las credenciales que te ha facilitado el responsable del proyecto.
        No hay registro público.
      </p>
      <label htmlFor="email">Correo</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        required
      />
      <label htmlFor="password">Contraseña</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        minLength={12}
        maxLength={128}
      />
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit">Entrar al laboratorio</button>
    </form>
  );
}

function Chat({
  identity,
  onLogout,
}: {
  identity: Identity;
  onLogout: () => void;
}) {
  const agent = useEveAgent();
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const busy =
    agent.status === "submitted" ||
    agent.status === "streaming" ||
    agent.status === "resuming";
  return (
    <div className="evaluation-chat">
      <div className="chat-toolbar">
        <h2>{identity.label}</h2>
        <button type="button" disabled={busy} onClick={() => agent.reset()}>
          Nueva conversación
        </button>
        <button
          type="button"
          onClick={async () => {
            await agent.cancel().catch(() => {});
            const response = await fetch("/api/auth/sign-out", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            if (response.ok) onLogout();
            else setNotice("No se pudo cerrar la sesión. Inténtalo de nuevo.");
          }}
        >
          Cerrar sesión
        </button>
      </div>
      <p className="notice">
        Sin datos en directo · Sin planificación de rutas · No introduzcas datos
        personales sensibles.
      </p>
      <div className="chat-messages" role="log" aria-label="Conversación">
        {agent.data.messages.length === 0 ? (
          <p>Prueba: «¿Qué fuentes de movilidad están disponibles?»</p>
        ) : null}
        {agent.data.messages.map((item) => (
          <article key={item.id} className={`chat-message ${item.role}`}>
            <strong>{item.role === "user" ? "Tú" : "Asistente"}</strong>
            <p>
              {item.parts
                .map((part) => (part.type === "text" ? part.text : ""))
                .join("\n")}
            </p>
          </article>
        ))}
      </div>
      {busy ? <p role="status">El asistente está respondiendo…</p> : null}
      {agent.error || notice ? (
        <p role="alert">
          {notice ||
            "No se pudo completar la respuesta. Comprueba tu acceso o el límite de evaluación (6 solicitudes/minuto, 60/día)."}
        </p>
      ) : null}
      <form
        className="evaluation-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const text = message.trim();
          if (!text || busy) return;
          setNotice("");
          setMessage("");
          try {
            await agent.send(text);
          } catch {
            setNotice("No se pudo enviar el mensaje.");
          }
        }}
      >
        <label htmlFor="message">Tu consulta</label>
        <textarea
          id="message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={1800}
          rows={3}
          required
          disabled={busy}
        />
        <button type="submit" disabled={busy || !message.trim()}>
          Enviar consulta
        </button>
      </form>
    </div>
  );
}
