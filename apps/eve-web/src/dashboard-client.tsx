"use client";
import {
  dashboardActivity,
  dashboardConversationIndexResponse,
  dashboardConversationSummaryResponse,
  dashboardData,
  dashboardEntityPage,
  dashboardEntitySeries,
  dashboardEventPage,
  dashboardMapPage,
  dashboardOverview,
  dashboardSourceResponse,
  dashboardStatus,
  dashboardToolCatalog,
  dashboardTracePayloadResponse,
  dashboardTraceResponse,
} from "@mobility/contracts";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR, { type State, SWRConfig } from "swr";
import {
  type DashboardRead,
  dashboardRetryDelay,
  eligibleDashboardRead,
  startVisibleHeartbeat,
} from "./dashboard-polling";
import { successfulReadAt } from "./dashboard-presentation";
export class DashboardHttpError extends Error {
  constructor(
    public status: number,
    public retryAfter: number,
  ) {
    super(`Solicitud no disponible (${status})`);
  }
}
type Identity = { principalId: string; label: string };
export type ViewReadStatus = {
  readAt: string | null;
  pending: boolean;
  failed: boolean;
};
type Context = {
  executionRecovery: Map<string, { requestId: string; unresolved: boolean }>;
  viewRead: ViewReadStatus | null;
  setViewRead: (value: ViewReadStatus | null) => void;
  identity: Identity;
  paused: boolean;
  setPaused: (v: boolean) => void;
  visible: boolean;
  request: (path: string, method?: string, body?: unknown) => Promise<unknown>;
  clear: () => void;
  cancelPending: () => void;
  activePaths: Map<string, number>;
  eligibility: Map<string, DashboardRead>;
  pending: Map<string, Promise<unknown>>;
};
const DashboardContext = createContext<Context | null>(null);
export function useDashboardContext() {
  const v = useContext(DashboardContext);
  if (!v) throw new Error("Dashboard context required");
  return v;
}
export function DashboardProvider({
  identity,
  children,
}: {
  identity: Identity;
  children: ReactNode;
}) {
  const [privateAccess, setPrivateAccess] = useState(true);
  const [viewRead, setViewRead] = useState<ViewReadStatus | null>(null);
  const [paused, setPaused] = useState(false),
    [visible, setVisible] = useState(true);
  const controllers = useRef(new Set<AbortController>()),
    cache = useMemo(
      () => new Map<string, State>([[identity.principalId, {}]]),
      [identity.principalId],
    );
  const scope = useMemo(
    () => ({
      principalId: identity.principalId,
      activePaths: new Map<string, number>(),
      eligibility: new Map<string, DashboardRead>(),
      pending: new Map<string, Promise<unknown>>(),
      executionRecovery: new Map<
        string,
        { requestId: string; unresolved: boolean }
      >(),
    }),
    [identity.principalId],
  );
  const { activePaths, eligibility, pending, executionRecovery } = scope;
  const heartbeat = useRef(0);
  const cancelPending = useCallback(() => {
    for (const c of controllers.current) c.abort();
    controllers.current.clear();
  }, []);
  const dispose = useCallback(() => {
    for (const c of controllers.current) c.abort();
    controllers.current.clear();
    cache.clear();
    eligibility.clear();
    pending.clear();
    executionRecovery.clear();
  }, [cache, eligibility, pending, executionRecovery]);
  const clear = useCallback(() => {
    dispose();
    setViewRead(null);
    setPrivateAccess(false);
  }, [dispose]);
  const request = async (path: string, method = "GET", body?: unknown) => {
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      const r = await fetch(`/api/dashboard/${path}`, {
        method,
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
        ...(method === "POST"
          ? { headers: { "Content-Type": "application/json" } }
          : {}),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (r.status === 401 || r.status === 403) {
        clear();
        window.location.replace("/evaluation");
        throw new DashboardHttpError(r.status, 0);
      }
      if (!r.ok)
        throw new DashboardHttpError(
          r.status,
          Number(r.headers.get("retry-after") ?? 0) * 1000,
        );
      const value = await r.json();
      if (controller.signal.aborted) throw new Error("Respuesta descartada");
      const root = path.split("?")[0];
      const schema =
        root === "conversations"
          ? dashboardConversationIndexResponse
          : root?.includes("/payloads/")
            ? dashboardTracePayloadResponse
            : root?.startsWith("conversations/") && root.endsWith("/summary")
              ? dashboardConversationSummaryResponse
              : root?.startsWith("conversations/") && root.endsWith("/events")
                ? dashboardTraceResponse
                : root?.endsWith("/history")
                  ? dashboardEntitySeries
                  : root === "overview"
                    ? dashboardOverview
                    : root === "status"
                      ? dashboardStatus
                      : root === "tools"
                        ? dashboardToolCatalog
                        : root === "sources" || root?.startsWith("sources/")
                          ? dashboardSourceResponse
                          : root === "events" || root?.startsWith("events/")
                            ? dashboardData.extend({ data: dashboardEventPage })
                            : root === "activity"
                              ? dashboardActivity
                              : root === "entities"
                                ? dashboardEntityPage
                                : root === "map"
                                  ? dashboardMapPage
                                  : dashboardData;
      return schema.parse(value);
    } finally {
      controllers.current.delete(controller);
    }
  };
  const currentRequest = useRef(request);
  currentRequest.current = request;
  useEffect(() => {
    const update = () => {
      const shown = document.visibilityState === "visible" && navigator.onLine;
      setVisible(shown);
      if (!shown) for (const c of controllers.current) c.abort();
    };
    const check = async () => {
      update();
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const controller = new AbortController();
        controllers.current.add(controller);
        let r: Response;
        try {
          r = await fetch("/api/evaluation", {
            cache: "no-store",
            signal: controller.signal,
          });
        } finally {
          controllers.current.delete(controller);
        }
        if (controller.signal.aborted) return;
        const next = r.ok ? await r.json() : null;
        if (next?.principalId !== identity.principalId) {
          clear();
          window.location.replace("/evaluation");
        }
      } catch {
        /* Existing stored data remain marked with their read time. */
      }
    };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("online", check);
    window.addEventListener("offline", update);
    window.addEventListener("focus", check);
    return () => {
      dispose();
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", update);
      window.removeEventListener("focus", check);
    };
  }, [identity.principalId, clear, dispose]);
  useEffect(() => {
    if (paused || !visible || !privateAccess) {
      for (const c of controllers.current) c.abort();
      return;
    }
    return startVisibleHeartbeat(
      () => document.visibilityState === "visible" && navigator.onLine,
      () => {
        void currentRequest.current("activity", "POST", {}).catch(() => {});
      },
      heartbeat,
    );
  }, [paused, visible, privateAccess]);
  return (
    <DashboardContext.Provider
      value={{
        identity,
        viewRead,
        setViewRead,
        paused,
        setPaused,
        visible,
        request,
        clear,
        cancelPending,
        executionRecovery,
        eligibility,
        activePaths,
        pending,
      }}
    >
      <SWRConfig
        value={{
          provider: () => cache,
          revalidateOnFocus: true,
          refreshWhenHidden: false,
          refreshWhenOffline: false,
          keepPreviousData: false,
        }}
      >
        {privateAccess ? (
          children
        ) : (
          <main lang="en" className="p-8">
            <p role="alert">
              Private dashboard details cleared. Sign in to continue.
            </p>
            <a href="/evaluation">Return to sign in</a>
          </main>
        )}
      </SWRConfig>
    </DashboardContext.Provider>
  );
}
export function useDashboard(
  path: string | null,
  interval = 15000,
  primary = false,
) {
  const ctx = useDashboardContext();
  const last = ctx.eligibility;
  useEffect(() => {
    if (!path) return;
    ctx.activePaths.set(path, (ctx.activePaths.get(path) ?? 0) + 1);
    return () => {
      const count = (ctx.activePaths.get(path) ?? 1) - 1;
      if (count === 0) ctx.activePaths.delete(path);
      else ctx.activePaths.set(path, count);
    };
  }, [path, ctx.activePaths]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    if (ctx.paused || !ctx.visible) {
      for (const t of timers.current) clearTimeout(t);
      timers.current.clear();
    }
    return () => {
      for (const t of timers.current) clearTimeout(t);
      timers.current.clear();
    };
  }, [ctx.paused, ctx.visible]);
  const key = path ? `${ctx.identity.principalId}:${path}` : null;
  const result = useSWR(
    key,
    async () => {
      if (!path) return null;
      return eligibleDashboardRead(path, interval, last, ctx.pending, () =>
        ctx.request(path),
      );
    },
    {
      revalidateOnFocus: interval > 0,
      revalidateOnReconnect: interval > 0,
      dedupingInterval: interval || 15000,
      isPaused: () => ctx.paused || !ctx.visible,
      refreshInterval: (data: unknown) => {
        if (path?.includes("/summary")) {
          const d = data as { data?: { state?: string } };
          return !d?.data || d.data.state === "running" ? interval : 0;
        }
        return interval;
      },
      onErrorRetry: (
        error: DashboardHttpError,
        _key,
        _config,
        revalidate,
        { retryCount },
      ) => {
        if (
          [400, 401, 403, 404, 409].includes(error.status) ||
          ctx.paused ||
          !ctx.visible ||
          retryCount > 6
        )
          return;
        const delay = dashboardRetryDelay(
          interval,
          error.retryAfter,
          retryCount,
        );
        const timer = setTimeout(() => {
          timers.current.delete(timer);
          if (
            document.visibilityState === "visible" &&
            navigator.onLine &&
            !ctx.paused
          )
            void revalidate({ retryCount });
        }, delay);
        timers.current.add(timer);
      },
    },
  );
  const readAt = successfulReadAt(result.data);
  const { setViewRead } = ctx;
  useEffect(() => {
    if (primary && path)
      setViewRead({
        readAt,
        pending: result.isValidating,
        failed: Boolean(result.error),
      });
  }, [primary, path, readAt, result.isValidating, result.error, setViewRead]);
  useEffect(() => {
    if (!primary || !path) return;
    return () => setViewRead(null);
  }, [primary, path, setViewRead]);
  return result;
}
