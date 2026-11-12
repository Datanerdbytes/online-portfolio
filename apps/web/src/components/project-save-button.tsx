"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export type ProjectSaveMode = "create" | "edit";

export interface ProjectSaveButtonProps {
  mode: ProjectSaveMode;
  /** True while the create or update request is in flight. */
  saving: boolean;
  /** True while any other write is in flight and the form must stay locked. */
  disabled: boolean;
}

/**
 * Submit control for the project form.
 *
 * The busy state is driven by the save request itself rather than by a shared
 * "anything is pending" flag, so the spinner only appears while this form is
 * actually saving.
 */
export function ProjectSaveButton({
  mode,
  saving,
  disabled,
}: ProjectSaveButtonProps) {
  return (
    <Button type="submit" size="lg" disabled={disabled} className="gap-2">
      {saving ? (
        <>
          <Spinner />
          Saving…
        </>
      ) : mode === "create" ? (
        "Create project"
      ) : (
        "Save project details"
      )}
    </Button>
  );
}
