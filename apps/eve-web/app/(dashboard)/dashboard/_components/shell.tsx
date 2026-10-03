"use client";
import "./dashboard.css";
import {
  Activity,
  ArrowLeft,
  Blocks,
  Database,
  Info,
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
import { Button } from "@/components/ui/button";
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
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="dc-navigation" aria-label="Dashboard">
      {links.map(({ href, label, icon: Icon }, index) => (
        <div key={href}>
          {[0, 3, 5].includes(index) ? (
            <p className="dc-nav-group">
              {index === 0 ? "Explore" : index === 3 ? "System" : "Personal"}
            </p>
          ) : null}
          <Link
            href={href}
            {...(onNavigate ? { onClick: onNavigate } : {})}
            className="dc-nav-link"
            aria-current={
              (href === "/dashboard" ? path === href : path.startsWith(href))
                ? "page"
                : undefined
            }
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </Link>
        </div>
      ))}
    </nav>
  );
}
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const ctx = useDashboardContext();
  const path = usePathname();
  const [notice, setNotice] = useState("");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [timingOpen, setTimingOpen] = useState(false);
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
  const label =
    links.find((l) =>
      l.href === "/dashboard" ? path === l.href : path.startsWith(l.href),
    )?.label ?? "Mobility Core";
  return (
    <div className="dashboard-shell" lang="en">
      <a href="#dashboard-main" className="dc-skip">
        Skip to content
      </a>
      <aside className="dc-sidebar" aria-label="Navigation and account">
        <Link href="/dashboard" className="dc-brand">
          Mobility Core<span className="dc-meta">Evaluation workspace</span>
        </Link>
        <Navigation />
        <div className="dc-account">
          <Link href="/s" className="dc-nav-link">
            <ArrowLeft size={16} aria-hidden="true" />
            Open chat
          </Link>
          <p className="dc-meta">Evaluation account</p>
          <p className="break-words text-sm">{ctx.identity.label}</p>
          <Button variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </aside>
      <div className="dc-main-column">
        <header className="dc-header">
          <div className="flex min-w-0 items-center gap-2">
            <div className="dc-mobile-nav">
              <Sheet
                open={navigationOpen}
                onOpenChange={setNavigationOpen}
                title="Mobility Core"
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open navigation"
                  >
                    <Menu />
                  </Button>
                }
              >
                <Navigation onNavigate={() => setNavigationOpen(false)} />
                <Link href="/s" className="dc-nav-link">
                  Open chat
                </Link>
                <Button variant="ghost" onClick={signOut}>
                  Sign out
                </Button>
              </Sheet>
            </div>
            <span className="dc-header-context">Evaluation / {label}</span>
          </div>
          <div className="dc-header-actions">
            <span className="dc-read-label" aria-live="polite">
              {ctx.paused ? (
                "Paused"
              ) : ctx.viewRead?.failed ? (
                "Refresh failed"
              ) : ctx.viewRead?.pending ? (
                "Refreshing"
              ) : ctx.viewRead?.readAt ? (
                <>
                  <span>Read </span>
                  <Instant value={ctx.viewRead.readAt} />
                </>
              ) : (
                "Waiting for data"
              )}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => ctx.setPaused(!ctx.paused)}
              aria-label={ctx.paused ? "Resume refresh" : "Pause refresh"}
            >
              {ctx.paused ? <Play /> : <Pause />}
              <span className="dc-control-label">
                {ctx.paused ? "Resume" : "Pause"}
              </span>
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
                <Button size="icon" variant="ghost" aria-label="Data timing">
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
                        ? "Every 15 seconds while visible"
                        : "Suspended while hidden"}
                    . Refresh only reads stored evidence.
                  </dd>
                </div>
                <div>
                  <dt>Capture activity</dt>
                  <dd>
                    {error
                      ? "Worker status unavailable"
                      : status?.ingestionEnabled
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
                <p className="dc-meta">
                  Visible, unpaused activity renews the bounded capture window
                  every 60 seconds. Pausing stops renewal, not an in-progress
                  provider request. Observation and ingestion times remain
                  attached to each record.
                </p>
              </dl>
            </Sheet>
          </div>
        </header>
        {notice ? (
          <p role="status" className="px-4 py-2 text-xs">
            {notice}
          </p>
        ) : null}
        <main id="dashboard-main" className="dc-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
