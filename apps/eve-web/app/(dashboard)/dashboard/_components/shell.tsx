"use client";
import "./dashboard.css";
import {
  Activity,
  Blocks,
  ChevronLeft,
  Database,
  Info,
  LogOut,
  MessageSquare,
  Pause,
  Play,
  Radio,
  RefreshCw,
  UserRound,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useDashboard, useDashboardContext } from "@/src/dashboard-client";
import { Sheet } from "./primitives";
import { Instant } from "./shared";

const links = [
  { href: "/dashboard", label: "Overview", icon: Blocks },
  { href: "/dashboard/mobility", label: "Mobility", icon: Database },
  { href: "/dashboard/tools", label: "Queries", icon: Wrench },
  { href: "/dashboard/sources", label: "Sources", icon: Radio },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
  {
    href: "/dashboard/conversations",
    label: "My conversations",
    icon: MessageSquare,
  },
];
const initials = (label: string) =>
  label
    .split(/\s+/)
    .filter((part) => /^\p{L}/u.test(part))
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
function Navigation() {
  const path = usePathname();
  const { setOpenMobile } = useSidebar();
  return (
    <nav aria-label="Dashboard">
      <SidebarMenu>
        {links.map(({ href, label, icon: Icon }) => (
          <SidebarMenuItem key={href}>
            <SidebarMenuButton
              asChild
              isActive={
                href === "/dashboard" ? path === href : path.startsWith(href)
              }
              tooltip={{
                children: label,
                className: "dashboard-dialog dc-tooltip",
              }}
            >
              <Link
                href={href}
                aria-label={label}
                onClick={() => setOpenMobile(false)}
                aria-current={
                  (
                    href === "/dashboard"
                      ? path === href
                      : path.startsWith(href)
                  )
                    ? "page"
                    : undefined
                }
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </nav>
  );
}
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const ctx = useDashboardContext();
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarResolved, setSidebarResolved] = useState(false);
  useEffect(() => {
    setSidebarOpen(window.matchMedia("(min-width:1280px)").matches);
    setSidebarResolved(true);
  }, []);
  useEffect(() => {
    if (!notice || notice.startsWith("Sign out")) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const [controlsOpen, setControlsOpen] = useState(false);
  useEffect(() => {
    setControlsOpen(
      window.localStorage.getItem("dashboard-header-controls") === "open",
    );
  }, []);
  const toggleControls = (open: boolean) => {
    setControlsOpen(open);
    window.localStorage.setItem(
      "dashboard-header-controls",
      open ? "open" : "closed",
    );
  };
  const [timingOpen, setTimingOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const { data, error } = useDashboard("status", 3000);
  const { mutate } = useSWRConfig();
  const status = data as
    | { activeUntil?: string; ingestionEnabled?: boolean }
    | undefined;
  const signOut = async () => {
    ctx.clear();
    try {
      const r = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (r.ok) window.location.replace("/evaluation");
      else setNotice("Sign out failed. Private details have been cleared.");
    } catch {
      setNotice("Sign out failed. Private details have been cleared.");
    }
  };
  const refresh = () => {
    const now = Date.now();
    const waits = [...ctx.eligibility]
      .filter(([key]) => key !== "status" && ctx.activePaths.has(key))
      .map(([, v]) =>
        Math.max(0, 15000 - (now - v.at), (v.retryUntil ?? 0) - now),
      );
    const wait = Math.max(0, ...waits);
    setNotice(
      ctx.paused
        ? "Refresh is paused. Resume to read stored data."
        : wait > 0
          ? `Stored data can be reread in ${Math.ceil(wait / 1000)} seconds.`
          : "Stored-data refresh requested.",
    );
    void mutate(
      (key) =>
        typeof key === "string" &&
        key.startsWith(`${ctx.identity.principalId}:`) &&
        (key.endsWith(":status") ||
          ctx.activePaths.has(key.slice(ctx.identity.principalId.length + 1))),
      undefined,
      { revalidate: true, populateCache: false },
    );
  };
  const readState = ctx.paused
    ? "paused"
    : ctx.viewRead?.failed
      ? "failed"
      : ctx.viewRead?.pending
        ? "pending"
        : "read";
  const readLabel = ctx.paused
    ? "Paused"
    : ctx.viewRead?.failed
      ? ctx.viewRead.readAt
        ? "Cached · refresh failed"
        : "Read failed"
      : ctx.viewRead?.pending
        ? "Reading"
        : "Read";
  return (
    <SidebarProvider
      className="dashboard-shell"
      lang="en"
      open={sidebarOpen}
      onOpenChange={(v) => {
        setSidebarOpen(v);
        setSidebarResolved(true);
      }}
      data-resolved={sidebarResolved}
      style={
        {
          "--sidebar-width": "200px",
          "--sidebar-width-icon": "56px",
        } as React.CSSProperties
      }
    >
      <a href="#dashboard-main" className="dc-skip">
        Skip to content
      </a>
      <Sidebar collapsible="icon" dashboardScope>
        <SidebarHeader className="dc-brand">
          <Link href="/dashboard" aria-label="Mobility Core">
            <span className="dc-brand-mark" aria-hidden="true">
              <Blocks size={14} />
            </span>
            <span className="dc-brand-label">Mobility Core</span>
          </Link>
        </SidebarHeader>
        <SidebarContent className="dc-navigation">
          <Navigation />
        </SidebarContent>
        <SidebarFooter className="dc-account">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip={{
                  children: "Open chat",
                  className: "dashboard-dialog dc-tooltip",
                }}
              >
                <Link href="/s" aria-label="Open chat">
                  <MessageSquare />
                  <span>Open chat</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Sheet
                open={accountOpen}
                onOpenChange={setAccountOpen}
                title="Current account"
                trigger={
                  <SidebarMenuButton
                    className="dc-identity"
                    tooltip={{
                      children: ctx.identity.label,
                      className: "dashboard-dialog dc-tooltip",
                    }}
                    aria-label={`Account: ${ctx.identity.label}`}
                  >
                    <span className="dc-avatar" aria-hidden="true">
                      {initials(ctx.identity.label) || <UserRound />}
                    </span>
                    <span>{ctx.identity.label}</span>
                  </SidebarMenuButton>
                }
              >
                <p>{ctx.identity.label}</p>
              </Sheet>
            </SidebarMenuItem>
            <SidebarMenuItem className="dc-sign-out">
              <SidebarMenuButton
                onClick={signOut}
                aria-label="Sign out"
                tooltip={{
                  children: "Sign out",
                  className: "dashboard-dialog dc-tooltip",
                }}
              >
                <LogOut />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <div className="dc-main-column">
        <header className="dc-header">
          <SidebarTrigger aria-label="Toggle navigation" />
          <div className="dc-header-actions">
            <div
              id="dc-header-controls"
              className="dc-header-controls"
              data-open={controlsOpen}
              inert={!controlsOpen}
            >
              <div className="dc-header-controls-inner">
                <span className="dc-read-label">
                  {readLabel}
                  {" · "}
                  {ctx.viewRead?.readAt ? (
                    <Instant value={ctx.viewRead.readAt} compact />
                  ) : (
                    "no successful read"
                  )}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => ctx.setPaused(!ctx.paused)}
                  aria-label={ctx.paused ? "Resume refresh" : "Pause refresh"}
                >
                  {ctx.paused ? <Play /> : <Pause />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Refresh stored data"
                  onClick={refresh}
                >
                  <RefreshCw />
                </Button>
                <Sheet
                  open={timingOpen}
                  onOpenChange={setTimingOpen}
                  title="Data timing"
                  description="Screen reads, provider observations and capture activity are separate."
                  trigger={
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Data timing"
                    >
                      <Info />
                    </Button>
                  }
                >
                  <dl className="dc-stack">
                    <div>
                      <dt>Last successful view read</dt>
                      <dd>
                        <Instant value={ctx.viewRead?.readAt} />
                      </dd>
                    </div>
                    <div>
                      <dt>Screen refresh</dt>
                      <dd>
                        {ctx.paused
                          ? "Paused"
                          : ctx.visible
                            ? "Visible dynamic evidence reads every 15 seconds; running conversation reads every 3 seconds. Paged and reference reads are manual. Worker status reads separately every 3 seconds"
                            : "Suspended while hidden"}
                        . Refresh only reads stored evidence.
                      </dd>
                    </div>
                    <div>
                      <dt>Capture activity</dt>
                      <dd>
                        {error
                          ? "Worker status unavailable"
                          : !status
                            ? "Unavailable"
                            : status.ingestionEnabled
                              ? "Enabled"
                              : "Disabled"}
                      </dd>
                    </div>
                    <div>
                      <dt>Activity window expires</dt>
                      <dd>
                        <Instant value={status?.activeUntil} />
                      </dd>
                    </div>
                  </dl>
                  <p className="dc-meta">
                    Visible, unpaused activity renews the bounded capture window
                    every 60 seconds. Pausing stops renewal, not an in-progress
                    provider request. Observation and ingestion times remain
                    attached to each record.
                  </p>
                </Sheet>
                <span className="dc-header-divider" aria-hidden="true" />
                <ThemeSwitcher />
              </div>
            </div>
            <button
              type="button"
              className="dc-status-toggle"
              data-state={readState}
              aria-expanded={controlsOpen}
              aria-controls="dc-header-controls"
              aria-label={`${readLabel}. ${controlsOpen ? "Hide" : "Show"} refresh controls`}
              onClick={() => toggleControls(!controlsOpen)}
            >
              <span className="dc-status-dot" aria-hidden="true" />
              {readState !== "read" ? (
                <span className="dc-status-text">{readLabel}</span>
              ) : null}
              <ChevronLeft className="dc-status-chevron" aria-hidden="true" />
            </button>
          </div>
        </header>
        <p role="status" className="dc-notice" data-visible={Boolean(notice)}>
          {notice}
        </p>
        <main id="dashboard-main" className="dc-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
