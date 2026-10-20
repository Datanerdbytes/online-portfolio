"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AdminSessionControls({ canCheck = true }: { canCheck?: boolean }) {
  const router = useRouter();
  const active = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => () => { const controller = active.current; active.current = null; controller?.abort(); }, []);

  async function run(action: "check" | "logout") {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/auth/${action}`, {
        method: "POST", headers: { "X-Requested-With": "online-resume-admin" },
        signal: controller.signal, cache: "no-store",
      });
      if (action === "logout" && response.status === 204) {
        router.replace("/auth/signin");
        router.refresh();
        return;
      }
      if (response.status === 401 || response.status === 403) {
        setMessage("Your session could not be verified. Sign in again.");
      } else if (!response.ok) {
        setMessage("Administration is unavailable. Please try again.");
      } else {
        setMessage("Session verified successfully.");
      }
    } catch {
      if (active.current === controller) setMessage("Administration is unavailable. Please try again.");
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) {
        active.current = null;
        setPending(false);
      }
    }
  }

  return <div className="space-y-3">
    <div className="flex flex-wrap gap-3">
      {canCheck ? <Button size="lg" disabled={pending} onClick={() => void run("check")}>
        Run diagnostic check
      </Button> : <Button size="lg" onClick={() => router.refresh()}>Retry status</Button>}
      <Button size="lg" variant="outline" disabled={pending} onClick={() => void run("logout")}>
        Sign out
      </Button>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{pending ? "Checking…" : message}</p>
  </div>;
}
