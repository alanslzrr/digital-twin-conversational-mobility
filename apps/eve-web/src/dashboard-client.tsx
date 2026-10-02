"use client";
import {
  dashboardActivity,
  dashboardData,
  dashboardEntityPage,
  dashboardMapPage,
  dashboardStatus,
  dashboardToolCatalog,
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
  dashboardRetryDelay,
  pollingEligible,
  startVisibleHeartbeat,
} from "./dashboard-polling";
export class DashboardHttpError extends Error {
  constructor(
    public status: number,
    public retryAfter: number,
  ) {
    super(`Solicitud no disponible (${status})`);
  }
}
type Identity = { principalId: string; label: string };
type Context = {
  identity: Identity;
  paused: boolean;
  setPaused: (v: boolean) => void;
  visible: boolean;
  request: (path: string, method?: string, body?: unknown) => Promise<unknown>;
  clear: () => void;
  eligibility: Map<string, { at: number; value: unknown; error?: unknown }>;
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
  const [paused, setPaused] = useState(false),
    [visible, setVisible] = useState(true);
  const controllers = useRef(new Set<AbortController>()),
    cache = useMemo(
      () => new Map<string, State>([[identity.principalId, {}]]),
      [identity.principalId],
    );
  const heartbeat = useRef(0);
  const eligibility = useRef(
    new Map<string, { at: number; value: unknown; error?: unknown }>(),
  ).current;
  const clear = useCallback(() => {
    for (const c of controllers.current) c.abort();
    controllers.current.clear();
    cache.clear();
    eligibility.clear();
  }, [cache, eligibility]);
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
        root === "status"
          ? dashboardStatus
          : root === "tools"
            ? dashboardToolCatalog
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
      clear();
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", update);
      window.removeEventListener("focus", check);
    };
  }, [identity.principalId, clear]);
  useEffect(() => {
    if (paused || !visible) {
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
  }, [paused, visible]);
  return (
    <DashboardContext.Provider
      value={{
        identity,
        paused,
        setPaused,
        visible,
        request,
        clear,
        eligibility,
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
        {children}
      </SWRConfig>
    </DashboardContext.Provider>
  );
}
export function useDashboard(path: string | null, interval = 15000) {
  const ctx = useDashboardContext();
  const last = ctx.eligibility;
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
  return useSWR(
    key,
    async () => {
      if (!path) return null;
      const old = last.get(path);
      if (old && !pollingEligible(old.at, interval)) {
        if (old.error) throw old.error;
        return old.value;
      }
      let value: unknown;
      try {
        value = await ctx.request(path);
      } catch (error) {
        last.set(path, { at: Date.now(), value: old?.value, error });
        throw error;
      }
      last.set(path, { at: Date.now(), value });
      if (last.size > 32) last.delete(last.keys().next().value ?? "");
      return value;
    },
    {
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
}
