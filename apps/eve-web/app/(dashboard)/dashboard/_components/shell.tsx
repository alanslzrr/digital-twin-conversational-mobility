"use client";
import { useUi } from "@/i18n/provider";

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
import { LocaleSwitcher } from "@/components/locale-switcher";
import { MobaiBrand } from "@/components/mobai-brand";
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
  const { t } = useUi();

  const path = usePathname();
  const { setOpenMobile } = useSidebar();
  return (
    <nav aria-label={t("shell.dashboard")}>
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
  const { t, locale, copy } = useUi();

  const ctx = useDashboardContext();
  const [notice, setNotice] = useState<string | number>("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarResolved, setSidebarResolved] = useState(false);
  useEffect(() => {
    setSidebarOpen(window.matchMedia("(min-width:1280px)").matches);
    setSidebarResolved(true);
  }, []);
  useEffect(() => {
    if (
      !notice ||
      (typeof notice === "string" && notice.startsWith("Sign out"))
    )
      return;
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
          ? Math.ceil(wait / 1000)
          : "Stored data refresh requested.",
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
    ? t("shell.paused")
    : ctx.viewRead?.failed
      ? ctx.viewRead.readAt
        ? t("shell.cachedRefreshFailed")
        : t("shell.readFailed")
      : ctx.viewRead?.pending
        ? t("insights.reading")
        : t("shell.read");
  return (
    <SidebarProvider
      className="dashboard-shell"
      lang={locale}
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
        {t("shell.skipToContent")}
      </a>
      <Sidebar collapsible="icon" dashboardScope>
        <SidebarHeader className="dc-brand">
          <Link href="/dashboard" aria-label="mobai">
            <MobaiBrand labelClassName="dc-brand-label" />
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
                  children: t("conversationView.openChat"),
                  className: "dashboard-dialog dc-tooltip",
                }}
              >
                <Link href="/s" aria-label={t("conversationView.openChat")}>
                  <MessageSquare />
                  <span>{t("conversationView.openChat")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Sheet
                open={accountOpen}
                onOpenChange={setAccountOpen}
                title={t("shell.currentAccount")}
                trigger={
                  <SidebarMenuButton
                    className="dc-identity"
                    tooltip={{
                      children: ctx.identity.label,
                      className: "dashboard-dialog dc-tooltip",
                    }}
                    aria-label={t("presentation.account", {
                      label: ctx.identity.label,
                    })}
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
                aria-label={t("shell.signOut")}
                tooltip={{
                  children: t("shell.signOut"),
                  className: "dashboard-dialog dc-tooltip",
                }}
              >
                <LogOut />
                <span>{t("shell.signOut")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <div className="dc-main-column">
        <header className="dc-header">
          <SidebarTrigger aria-label={t("shell.toggleNavigation")} />
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
                    t("shell.noSuccessfulRead")
                  )}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => ctx.setPaused(!ctx.paused)}
                  aria-label={
                    ctx.paused
                      ? t("shell.resumeRefresh")
                      : t("shell.pauseRefresh")
                  }
                >
                  {ctx.paused ? <Play /> : <Pause />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("shell.refreshStoredData")}
                  onClick={refresh}
                >
                  <RefreshCw />
                </Button>
                <Sheet
                  open={timingOpen}
                  onOpenChange={setTimingOpen}
                  title={t("shell.dataTiming")}
                  description={t(
                    "shell.screenReadsProviderObservationsAndCaptureActivityAreSeparate",
                  )}
                  trigger={
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("shell.dataTiming")}
                    >
                      <Info />
                    </Button>
                  }
                >
                  <dl className="dc-stack">
                    <div>
                      <dt>{t("shell.lastSuccessfulViewRead")}</dt>
                      <dd>
                        <Instant value={ctx.viewRead?.readAt} />
                      </dd>
                    </div>
                    <div>
                      <dt>{t("shell.screenRefresh")}</dt>
                      <dd>
                        {ctx.paused
                          ? t("shell.paused")
                          : ctx.visible
                            ? t(
                                "shell.visibleDynamicEvidenceReadsEvery15SecondsRunningConversation",
                              )
                            : t("shell.suspendedWhileHidden")}
                        {". "}
                        {t("presentation.refreshOnly")}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("shell.captureActivity")}</dt>
                      <dd>
                        {error
                          ? t("shell.workerStatusUnavailable")
                          : !status
                            ? t("activityView.unavailable")
                            : status.ingestionEnabled
                              ? t("shell.enabled")
                              : t("overviewView.disabled")}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("shell.activityWindowExpires")}</dt>
                      <dd>
                        <Instant value={status?.activeUntil} />
                      </dd>
                    </div>
                  </dl>
                  <p className="dc-meta">
                    {t(
                      "shell.visibleUnpausedActivityRenewsTheBoundedCaptureWindowEvery",
                    )}
                  </p>
                </Sheet>
              </div>
            </div>
            <div className="dc-preferences">
              <LocaleSwitcher />
              <ThemeSwitcher />
            </div>
            <button
              type="button"
              className="dc-status-toggle"
              data-state={readState}
              aria-expanded={controlsOpen}
              aria-controls="dc-header-controls"
              aria-label={t("presentation.refreshControls", {
                state: readLabel,
                action: controlsOpen ? t("shell.hide") : t("shell.show"),
              })}
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
          {typeof notice === "number"
            ? t("presentation.refreshWaiting", { count: notice })
            : copy(notice)}
        </p>
        <main id="dashboard-main" className="dc-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
