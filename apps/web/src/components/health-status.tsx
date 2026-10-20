"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type HealthState = "idle" | "loading" | "ok" | "unavailable";

export function HealthStatus() {
  const [state, setState] = useState<HealthState>("idle");

  useEffect(() => {
    let cancelled = false;
    async function check() {
      setState("loading");
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (cancelled) return;
        if (response.ok) {
          const data = (await response.json()) as { status?: string };
          setState(data.status === "ok" ? "ok" : "unavailable");
        } else {
          setState("unavailable");
        }
      } catch {
        if (cancelled) return;
        setState("unavailable");
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderState = () => {
    if (state === "idle" || state === "loading") {
      return (
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-muted animate-pulse" aria-hidden="true" />
          API status
        </span>
      );
    }
    if (state === "ok") {
      return (
        <Alert>
          <AlertTitle>Backend API is online</AlertTitle>
          <AlertDescription>GET /api/v1/health returned ok.</AlertDescription>
        </Alert>
      );
    }
    return (
      <Alert variant="destructive">
        <AlertTitle>Backend API is unavailable</AlertTitle>
        <AlertDescription>
          The API could not be reached. The page still renders without it.
        </AlertDescription>
      </Alert>
    );
  };

  return (
    <div className="flex items-center gap-2 text-xs sm:text-sm">
      {renderState()}
      <Badge variant={state === "ok" ? "default" : "secondary"}>
        {state}
      </Badge>
    </div>
  );
}
