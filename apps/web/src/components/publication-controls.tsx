"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ShareLinkButton } from "@/components/share-link-button";
import { isPortfolioStatus, type PortfolioStatus } from "@/lib/portfolio";

export function PublicationControls({ initial }: { initial: PortfolioStatus }) {
  const [status, setStatus] = useState(initial);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const active = useRef(false);
  const router = useRouter();

  async function update(action: "publish" | "unpublish") {
    if (active.current) return;
    active.current = true;
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(`/api/portfolio/${action}`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "online-resume-admin",
        },
        body: JSON.stringify({ revision: status.revision }),
      });
      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? "Your draft changed. Refresh this preview before publishing."
            : [401, 403].includes(response.status)
              ? "Your session expired. Sign in again to continue."
              : "We couldn’t update publication. Please retry; your draft is saved."
        );
      }
      const data: unknown = await response.json();
      if (!isPortfolioStatus(data))
        throw new Error(
          "We couldn’t confirm publication. Refresh to check its status."
        );
      setStatus(data);
      setConfirm(false);
      setMessage(
        action === "publish"
          ? "Your saved portfolio is now published. You can share its public link."
          : "Your portfolio is unpublished. Your draft is still available here."
      );
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error && error.name === "Error"
          ? error.message
          : "We couldn’t confirm publication. Refresh the preview to check its status. Your draft is saved."
      );
    } finally {
      active.current = false;
      setPending(false);
    }
  }

  return (
    <section
      className="space-y-4 rounded-xl border bg-card p-5 print:hidden"
      aria-label="Publication"
    >
      <h2 className="text-xl font-semibold">
        {status.is_published ? "Your portfolio is live" : "Private draft"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {status.is_published
          ? status.has_unpublished_changes
            ? "You have saved changes that are not public yet."
            : "Your published portfolio matches your saved draft."
          : "Only you can see your saved draft. Publish when you’re ready to share it."}
      </p>
      <p className="text-sm">
        This preview includes saved changes. Save any open editor forms before
        publishing.
      </p>
      {!status.profile_complete && (
        <p className="text-sm">
          Add your name, headline, and introduction in{" "}
          <Link className="underline" href="/admin/resume">
            Resume
          </Link>{" "}
          before publishing.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          disabled={
            pending ||
            !status.profile_complete ||
            (status.is_published && !status.has_unpublished_changes)
          }
          onClick={() => void update("publish")}
        >
          {pending
            ? "Updating…"
            : status.is_published
              ? "Publish saved changes"
              : "Publish portfolio"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={pending}
          onClick={() => router.refresh()}
        >
          Refresh preview
        </Button>
        {status.is_published && (
          <>
            <ShareLinkButton path={`/u/${status.owner_id}`} />
            <Button asChild size="lg" variant="outline">
              <Link href={`/u/${status.owner_id}`}>View live portfolio</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirm(true)}
            >
              Unpublish
            </Button>
          </>
        )}
      </div>
      <p role={failed ? "alert" : "status"} className="text-sm">
        {message}
      </p>
      <ConfirmDialog
        open={confirm}
        title="Unpublish your portfolio?"
        description="Visitors will no longer be able to view your portfolio. Your saved draft remains available, and you can publish it again later."
        confirmLabel="Unpublish"
        pendingLabel="Unpublishing…"
        cancelLabel="Keep published"
        pending={pending}
        onConfirm={() => void update("unpublish")}
        onCancel={() => {
          if (!pending) setConfirm(false);
        }}
      />
    </section>
  );
}
