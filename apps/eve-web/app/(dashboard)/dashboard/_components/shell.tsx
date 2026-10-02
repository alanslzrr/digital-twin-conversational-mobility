"use client";
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
  { href: "/dashboard/mobility", label: "Datos de movilidad", icon: Database },
  { href: "/dashboard/tools", label: "Herramientas MCP", icon: Wrench },
  { href: "/dashboard/sources", label: "Fuentes e ingestión", icon: Radio },
  { href: "/dashboard/activity", label: "Eventos", icon: Activity },
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
      {links.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          {...(onNavigate ? { onClick: onNavigate } : {})}
          href={href}
          aria-current={path === href ? "page" : undefined}
          className={cn(
            "mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
            (href === "/dashboard" ? path === href : path.startsWith(href))
              ? "bg-accent font-medium"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Icon size={16} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const ctx = useDashboardContext();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const { data, error } = useDashboard("status", 3000);
  const { mutate } = useSWRConfig();
  const status = data as { activeUntil?: string; ingestionEnabled?: boolean };
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <aside className="hidden border-r bg-card px-4 py-6 md:block">
        <p className="mb-7 px-3 text-sm font-semibold">Mobility Core</p>
        <Navigation />
        <Link
          href="/s"
          className="mt-8 flex items-center gap-2 px-3 text-sm text-muted-foreground"
        >
          <ArrowLeft size={16} />
          Volver al chat
        </Link>
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
                <DialogContent>
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
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:block">
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
              onClick={() =>
                void mutate(
                  (key) =>
                    typeof key === "string" &&
                    key.startsWith(`${ctx.identity.principalId}:`),
                  undefined,
                  { revalidate: true },
                )
              }
            >
              <RefreshCw />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                ctx.clear();
                const r = await fetch("/api/auth/sign-out", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                });
                if (r.ok) window.location.replace("/evaluation");
                else window.alert("No se pudo cerrar sesión.");
              }}
            >
              Salir
            </Button>
          </div>
        </header>
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-b px-5 py-2 text-xs text-muted-foreground md:px-8">
          <span>
            Actualización de pantalla:{" "}
            {ctx.paused ? "pausada" : ctx.visible ? "visible" : "suspendida"}
          </span>
          <span>
            Ventana de ingestión:{" "}
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
        </div>
        <main className="mx-auto flex max-w-[1440px] flex-col gap-6 p-5 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
