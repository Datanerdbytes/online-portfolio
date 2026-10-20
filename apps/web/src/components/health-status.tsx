"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const HEALTH_TIMEOUT_MS = 5000;

export type HealthState = "idle" | "checking" | "online" | "unavailable";

function renderState(state: HealthState) {
  switch (state) {
    case "idle":
    case "checking":
      return { label: "API checking", dot: "bg-muted animate-pulse motion-reduce:animate-none" };
    case "online":
      return { label: "API online", dot: "bg-green-500" };
    case "unavailable":
      return { label: "API unavailable", dot: "bg-red-500" };
  }
}

export function HealthStatus() {
  const [state, setState] = useState<HealthState>("idle");
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const check = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState("checking");

    const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const response = await fetch("/api/health", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (requestId !== requestIdRef.current) return;
      if (response.ok) {
        const data = (await response.json()) as { status?: unknown };
        if (requestId !== requestIdRef.current) return;
        setState(data.status === "ok" ? "online" : "unavailable");
      } else {
        setState("unavailable");
      }
    } catch {
      if (requestId !== requestIdRef.current) return;
      setState("unavailable");
    } finally {
      clearTimeout(timeoutId);
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await check();
    })();
    return () => {
      controllerRef.current?.abort();
    };
  }, [check]);

  const refresh = useCallback(() => {
    void check();
  }, [check]);

  const { label, dot } = renderState(state);

  return (
    <div className="flex items-center gap-2 text-xs sm:text-sm">
      <span role="status" aria-live="polite" aria-atomic="true" className="flex items-center gap-1.5 whitespace-nowrap">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className="font-medium">{label}</span>
      </span>
      <button
        type="button"
        aria-label="Refresh API status"
        disabled={state === "checking"}
        onClick={refresh}
        className="flex min-w-[44px] min-h-[44px] items-center justify-center rounded-md border border-input bg-background px-2 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors disabled:pointer-events-none disabled:opacity-50"
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14 17H7l-5-5 5-5M12 3v12"
          />
        </svg>
      </button>
    </div>
  );
}
