"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function AccountDangerZone() {
  const router = useRouter();
  const active = useRef<AbortController | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(
    () => () => {
      const controller = active.current;
      active.current = null;
      controller?.abort();
    },
    []
  );

  async function run() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/portfolio/data", {
        method: "DELETE",
        headers: { "X-Requested-With": "online-resume-admin" },
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.status === 204) {
        setSucceeded(true);
        setConfirming(false);
        router.refresh();
        return;
      }
      if (response.status === 401 || response.status === 403) {
        setMessage("Your session could not be verified. Sign in again.");
      } else {
        setMessage("Workspace data could not be deleted. Please try again.");
      }
      setConfirming(false);
    } catch {
      if (active.current === controller) {
        setMessage("Workspace data could not be deleted. Please try again.");
      }
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) {
        active.current = null;
        setPending(false);
      }
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Permanently deletes your resume, projects, uploaded images, import
        history, and the published portfolio. This cannot be undone. Your
        sign-in account is not deleted.
      </p>
      <Button
        variant="destructive"
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        Delete all portfolio data
      </Button>
      <p role="status" className="text-sm text-muted-foreground">
        {pending
          ? "Deleting…"
          : succeeded
            ? "All portfolio data was deleted."
            : message}
      </p>
      <ConfirmDialog
        open={confirming}
        title="Delete all portfolio data?"
        description="This permanently removes your resume, projects, uploaded images, import history, and the published portfolio. It cannot be undone. Your sign-in account stays active."
        confirmLabel="Delete everything"
        cancelLabel="Keep my data"
        pending={pending}
        pendingLabel="Deleting…"
        onConfirm={() => void run()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
