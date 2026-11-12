"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  publicationFailure,
  usePortfolioStatus,
  usePublishPortfolio,
  type ApiError,
} from "@/lib/project-queries";

/**
 * Persistent publication status for the resume editor: whether the saved
 * draft is private or live, with Publish and Preview one click away —
 * including the first publish, which previously required the preview page.
 */
export function EditorPublicationControl({
  /** Import review is open: nothing is saved yet, so publishing is blocked. */
  reviewing,
  /** A step-level save is in flight; sequence publishes after it. */
  savePending,
}: {
  reviewing: boolean;
  savePending: boolean;
}) {
  const status = usePortfolioStatus();
  const publish = usePublishPortfolio();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  const data = status.data ?? null;
  const blocked = reviewing || savePending || publishing;
  const missingProfile = data != null && !data.profile_complete;
  const canPublish =
    data != null &&
    !blocked &&
    !missingProfile &&
    (!data.is_published || data.has_unpublished_changes);

  async function publishNow() {
    if (!data || !canPublish) return;
    setPublishing(true);
    setError("");
    try {
      await publish.mutateAsync(data.revision);
    } catch (err) {
      const apiError = err as ApiError;
      // A stale revision is recoverable: refetching loads the revision the
      // backend expects, so the next attempt can succeed.
      if (apiError.status === 409) void status.refetch();
      setError(
        apiError instanceof Error && apiError.message
          ? apiError.message
          : publicationFailure(500)
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section
      aria-label="Publication status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm"
    >
      {status.isPending ? (
        <p className="text-muted-foreground">Checking publication status…</p>
      ) : status.isError ? (
        <p className="text-muted-foreground">
          Publication status is unavailable. Your saved draft is unchanged.
        </p>
      ) : data ? (
        <>
          <p className="font-medium">
            {data.is_published
              ? data.has_unpublished_changes
                ? "Live · unpublished changes saved"
                : "Live · all saved changes published"
              : "Private draft"}
          </p>
          {missingProfile && (
            <p className="text-muted-foreground">
              Publishing needs your{" "}
              <Link
                href="/admin/resume?step=profile"
                className="underline underline-offset-2"
              >
                name, headline, and introduction
              </Link>
              .
            </p>
          )}
          {reviewing && (
            <p className="text-muted-foreground">
              Save your import review before publishing.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!data.is_published || data.has_unpublished_changes ? (
              <Button
                size="sm"
                disabled={!canPublish}
                onClick={() => void publishNow()}
                aria-describedby={
                  missingProfile ? "publish-blocked-reason" : undefined
                }
              >
                {publishing ? (
                  <>
                    <Spinner />
                    Publishing…
                  </>
                ) : data.is_published ? (
                  "Publish changes"
                ) : (
                  "Publish"
                )}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/preview">Preview</Link>
            </Button>
          </div>
          {missingProfile && (
            <p id="publish-blocked-reason" className="sr-only">
              Add your name, headline, and introduction before publishing.
            </p>
          )}
        </>
      ) : null}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
