"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { PortfolioStatus } from "@/lib/portfolio";

export interface PublishChangesButtonProps {
  /** Loaded publication status, or null while it is unavailable. */
  status: PortfolioStatus | null;
  /** True while the publish request is in flight. */
  publishing: boolean;
  /** True while any other write is in flight and publishing must stay locked. */
  disabled: boolean;
  onPublish: () => void;
}

/**
 * Publishes the saved draft with one click when the portfolio is already
 * live and holds unpublished changes. Renders nothing unless the loaded
 * status reports exactly that, so it never implies an unreported state.
 */
export function PublishChangesButton({
  status,
  publishing,
  disabled,
  onPublish,
}: PublishChangesButtonProps) {
  if (
    !status?.is_published ||
    !status.has_unpublished_changes ||
    !status.profile_complete
  )
    return null;
  return (
    <Button
      className="min-h-11 gap-2"
      disabled={publishing || disabled}
      onClick={onPublish}
    >
      {publishing ? (
        <>
          <Spinner />
          Publishing…
        </>
      ) : (
        "Publish changes"
      )}
    </Button>
  );
}
