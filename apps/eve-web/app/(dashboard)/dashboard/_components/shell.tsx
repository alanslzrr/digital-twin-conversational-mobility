"use client";
import "./dashboard.css";
import {
  Activity,
  ArrowLeft,
  Blocks,
  Database,
  Menu,
  MessageSquare,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDashboard, useDashboardContext } from "@/src/dashboard-client";

const links = [
  { href: "/dashboard", label: "Resumen", icon: Blocks },
  { href: "/dashboard/mobility", label: "Movilidad", icon: Database },
  { href: "/dashboard/tools", label: "Consultas", icon: Wrench },
  { href: "/dashboard/sources", label: "Fuentes y actualización", icon: Radio },
  {
    href: "/dashboard/activity",
    label: "Actividad del sistema",
    icon: Activity,
  },
  {
    href: "/dashboard/conversations",
    label: "Mis conversaciones",
    icon: MessageSquare,
  },
];
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Panel">
      {links.map(({ href, label, icon: Icon }, index) => (
        <div key={href}>
          {[0, 3, 5].includes(index) ? (
            <p className="mb-2 mt-5 px-3 text-xs font-medium text-muted-foreground">
              {index === 0
                ? "Información"
                : index === 3
                  ? "Sistema"
                  : "Personal"}
            </p>
          ) : null}
          <Link
            key={href}
            {...(onNavigate ? { onClick: onNavigate } : {})}
            href={href}
            aria-current={
              (href === "/dashboard" ? path === href : path.startsWith(href))
                ? "page"
                : undefined
            }
            className={cn(
              "mb-1 flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
              (href === "/dashboard" ? path === href : path.startsWith(href))
                ? "bg-accent font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        </div>
      ))}
    </nav>
  );
}
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const ctx = useDashboardContext();
  const [refreshNotice, setRefreshNotice] = useState("");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const { data, error } = useDashboard("status", 3000);
  const { mutate } = useSWRConfig();
  const status = data as { activeUntil?: string; ingestionEnabled?: boolean };
  const signOut = async () => {
    ctx.clear();
    const r = await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (r.ok) window.location.replace("/evaluation");
    else window.alert("No se pudo cerrar sesión.");
  };
  return (
    <div className="dashboard-shell min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <aside
        aria-label="Navegación y cuenta"
        className="hidden min-h-dvh flex-col border-r bg-card px-4 py-6 md:flex"
      >
        <p className="mb-7 px-3 text-sm font-semibold">Mobility Core</p>
        <Navigation />
        <Link
          href="/s"
          className="mt-8 flex items-center gap-2 px-3 text-sm text-muted-foreground"
        >
          <ArrowLeft size={16} />
          Volver al chat
        </Link>
        <div className="mt-auto border-t pt-5">
          <p className="px-3 text-xs text-muted-foreground">
            Cuenta de evaluación
          </p>
          <p className="mt-2 break-words px-3 text-sm">{ctx.identity.label}</p>
          <Button
            variant="ghost"
            className="mt-2 w-full justify-start"
            onClick={signOut}
          >
            Cerrar sesión
          </Button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b bg-card px-5 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <div className="md:hidden">
              <Dialog open={navigationOpen} onOpenChange={setNavigationOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Abrir navegación"
                  >
                    <Menu />
                  </Button>
                </DialogTrigger>
                <DialogContent className="dashboard-dialog">
                  <DialogTitle>Mobility Core</DialogTitle>
                  <DialogDescription>
                    Vistas del panel privado de evaluación.
                  </DialogDescription>
                  <Navigation onNavigate={() => setNavigationOpen(false)} />
                  <Link href="/s">Volver al chat</Link>
                </DialogContent>
              </Dialog>
            </div>
            <span className="text-sm font-medium">Panel de evaluación</span>
            <Badge variant="secondary">Privado</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:block md:hidden">
              {ctx.identity.label}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => ctx.setPaused(!ctx.paused)}
            >
              {ctx.paused ? <Play /> : <Pause />}
              {ctx.paused ? "Reanudar" : "Pausar actualización"}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Actualizar pantalla"
              onClick={() => {
                const now = Date.now();
                const waits = [...ctx.eligibility]
                  .filter(
                    ([key]) => key !== "status" && ctx.activePaths.has(key),
                  )
                  .map(([, v]) =>
                    Math.max(
                      0,
                      15000 - (now - v.at),
                      (v.retryUntil ?? 0) - now,
                    ),
                  );
                const wait = Math.max(0, ...waits);
                setRefreshNotice(
                  ctx.paused
                    ? "La actualización está pausada; reanúdala para releer datos guardados."
                    : wait > 0
                      ? `Podrás releer en ${Math.ceil(wait / 1000)} segundos.`
                      : "Relectura solicitada; cada dato conserva su fecha.",
                );
                void mutate(
                  (key) =>
                    typeof key === "string" &&
                    key.startsWith(`${ctx.identity.principalId}:`) &&
                    (key.endsWith(":status") ||
                      ctx.activePaths.has(
                        key.slice(ctx.identity.principalId.length + 1),
                      )),
                  undefined,
                  { revalidate: true, populateCache: false },
                );
              }}
            >
              <RefreshCw />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="md:hidden"
              onClick={signOut}
            >
              Salir
            </Button>
          </div>
        </header>
        <section
          aria-label="Estado de actualización"
          className="flex flex-wrap gap-x-5 gap-y-1 border-b px-5 py-2 text-xs text-muted-foreground md:px-8"
        >
          <span>
            Actualización de pantalla:{" "}
            {ctx.paused ? "pausada" : ctx.visible ? "visible" : "suspendida"}
          </span>
          <span>
            Actualización desde las fuentes:{" "}
            {error
              ? "no se pudo comprobar"
              : !status?.ingestionEnabled
                ? "deshabilitada"
                : status.activeUntil
                  ? new Date(status.activeUntil).toLocaleString("es-ES", {
                      timeZone: "Europe/Madrid",
                      timeZoneName: "short",
                    })
                  : "inactiva"}
          </span>
        </section>
        <section
          aria-label="Cómo se actualiza la información"
          className="px-5 pt-3 text-xs leading-5 text-muted-foreground md:px-8"
        >
          <p>
            Actualizar pantalla relee los datos guardados. No solicita una
            lectura nueva a las fuentes.
          </p>
          <p>
            {ctx.paused
              ? "Panel pausado; el sistema puede seguir actualizándose por otra actividad."
              : "Mientras este panel está visible, mantiene la ventana de actualización existente. Cada fuente conserva su frecuencia."}
          </p>
          {refreshNotice ? <p role="status">{refreshNotice}</p> : null}
        </section>
        <main className="mx-auto flex max-w-[1440px] flex-col gap-6 p-5 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
