"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RecordActionButtons } from "@/components/record-action-buttons";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { StepEditControls } from "@/lib/resume-wizard";
import { useStepEdits } from "@/lib/use-step-edits";
import { ProjectSaveButton } from "@/components/project-save-button";
import { Spinner } from "@/components/ui/spinner";
import { FieldAiWriting } from "@/components/ai-writing-assistant";
import { manualFacts } from "@/lib/resume-import";
import { generateSlug, slugify } from "@/lib/slug";
import type { Project } from "@/lib/api";
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useReorderProjects,
  useUpdateProject,
  useUploadProjectScreenshot,
  useRemoveProjectScreenshot,
  type ApiError,
} from "@/lib/project-queries";
import {
  SCREENSHOT_ACCEPT,
  profileImageUrl,
  validateScreenshotFile,
} from "@/lib/avatar";
import {
  blankProjectForm,
  changedOrders,
  isSlug,
  MAX_ORDER,
  moveProjectToPosition,
  orderedProjects,
  parseProjectForm,
  projectEditsPending,
  projectFormFor,
  projectUpdateBody,
  PROJECT_NO_CHANGES_MESSAGE,
  safeProjectLink,
  type ProjectFormValues,
} from "@/lib/project-management";

type Status = "loading" | "ok" | "unavailable";

function ProjectScreenshotControl({
  project,
  disabled,
  onBusyChange,
}: {
  project: Project;
  /** True while the surrounding form is saving, so uploads must not overlap. */
  disabled: boolean;
  /** Reports whether a screenshot write is in flight to the parent form. */
  onBusyChange: (busy: boolean) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    updatedAt: Project["screenshot_updated_at"];
  } | null>(null);
  const upload = useUploadProjectScreenshot();
  const remove = useRemoveProjectScreenshot();
  const busy = upload.isPending || remove.isPending;
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  const imageSrc = profileImageUrl(
    project.screenshot_url,
    project.screenshot_updated_at,
    `/api/projects/${encodeURIComponent(project.slug)}/screenshot`
  );
  const screenshotName =
    uploadedFile && uploadedFile.updatedAt === project.screenshot_updated_at
      ? uploadedFile.name
      : "Saved screenshot";

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    setIsError(false);
    const validationError = validateScreenshotFile(file);
    if (validationError) {
      setIsError(true);
      setMessage(validationError);
      event.target.value = "";
      return;
    }
    try {
      const updated = await upload.mutateAsync({ slug: project.slug, file });
      setUploadedFile({
        name: file.name,
        updatedAt: updated.screenshot_updated_at,
      });
      setMessage("Screenshot saved to your draft.");
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : "Screenshot upload failed."
      );
    } finally {
      event.target.value = "";
    }
  }

  async function onRemove() {
    setMessage("");
    setIsError(false);
    try {
      await remove.mutateAsync(project.slug);
      setUploadedFile(null);
      setMessage("Project screenshot removed from your draft.");
      setConfirmRemove(false);
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : "Screenshot removal failed."
      );
    }
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <h3 className="text-sm font-semibold">Project screenshot</h3>
      <p className="text-sm text-muted-foreground">
        Screenshot uploads save to your draft automatically. Field changes save
        with the step&apos;s Save changes button.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-md border bg-muted">
          {imageSrc ? (
            <Image
              src={imageSrc}
              alt={`${project.title} screenshot preview`}
              fill
              sizes="128px"
              className="object-contain"
              unoptimized
            />
          ) : (
            <div className="flex size-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
              No image
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium [overflow-wrap:anywhere]">
            {imageSrc ? screenshotName : "No screenshot uploaded."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="gap-2"
              onClick={() => fileInput.current?.click()}
              disabled={busy || disabled}
            >
              {upload.isPending ? (
                <>
                  <Spinner />
                  Uploading…
                </>
              ) : imageSrc ? (
                "Replace screenshot"
              ) : (
                "Upload screenshot"
              )}
            </Button>
            {imageSrc ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-11 w-11"
                onClick={() => setConfirmRemove(true)}
                disabled={busy || disabled}
                aria-label="Remove screenshot"
                title="Remove screenshot"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            JPEG, PNG, or WebP up to 2 MB, resized to a thumbnail. GIF files up
            to 4 MB are converted and compressed to an animated thumbnail under
            2 MB.
          </p>
        </div>
      </div>
      {message ? (
        <p
          role={isError ? "alert" : "status"}
          className={`rounded-md border px-3 py-2 text-sm ${
            isError
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
          }`}
        >
          {message}
        </p>
      ) : null}
      <input
        ref={fileInput}
        type="file"
        accept={SCREENSHOT_ACCEPT}
        className="hidden"
        onChange={onFileChange}
      />
      <ConfirmDialog
        open={confirmRemove}
        title="Remove project screenshot?"
        description="This cannot be undone."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={onRemove}
        onCancel={() => setConfirmRemove(false)}
        pending={remove.isPending}
      />
    </div>
  );
}

export function ProjectManager({
  initialProjects,
  initialListStatus = "ok",
  headingLevel = "h2",
  onDirtyChange,
  onControls,
  ownerId = null,
}: {
  initialProjects: Project[];
  initialListStatus?: Status;
  headingLevel?: "h2" | "h3";
  /** Reports whether unsaved edits exist, for the wizard's step-leave guard. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Registers save/discard controls for the wizard's step footer. */
  onControls?: (controls: StepEditControls | null) => void;
  /** Owner id for the AI writing assistant; resolved lazily when null. */
  ownerId?: string | null;
}) {
  const projectsQuery = useProjects({
    initialData:
      initialListStatus === "ok" ? { items: initialProjects } : undefined,
  });
  const projects = useMemo(
    () => projectsQuery.data?.items ?? [],
    [projectsQuery.data?.items]
  );
  const listStatus: Status = projectsQuery.isPending
    ? "loading"
    : projectsQuery.isError
      ? "unavailable"
      : "ok";
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editing, setEditing] = useState<Project | null>(null);
  const [values, setValues] = useState<ProjectFormValues>(blankProjectForm);
  // The slug is generated from the title unless the user edits the Advanced
  // field, so creating a project never requires typing a URL-safe id.
  const [slugTouched, setSlugTouched] = useState(false);
  const [orders, setOrders] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState(false);
  const [success, setSuccess] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const previousProjects = useRef(projects);
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();
  const reorderMutation = useReorderProjects();
  const pending =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    reorderMutation.isPending;
  // The submit button reports only its own request, so its busy state never
  // reflects an unrelated delete or reorder that happens to be in flight.
  const saving = createMutation.isPending || updateMutation.isPending;
  // Screenshot uploads and removals write the same project row, so they must
  // not overlap the form save in either direction.
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const formBusy = saving || screenshotBusy;
  const onScreenshotBusy = useCallback((busy: boolean) => {
    setScreenshotBusy(busy);
  }, []);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousMode = useRef(mode);
  const submitting = useRef(false);

  const clearMessages = useCallback(() => {
    setError("");
    setAuthError(false);
    setSuccess("");
  }, []);
  useEffect(() => {
    const previous = new Map(
      previousProjects.current.map((project) => [
        project.slug,
        project.display_order,
      ])
    );
    setOrders((drafts) =>
      Object.fromEntries(
        projects.map((project) => {
          const draft = drafts[project.slug];
          const unsaved =
            draft !== undefined && draft !== String(previous.get(project.slug));
          return [
            project.slug,
            unsaved ? draft : String(project.display_order),
          ];
        })
      )
    );
    previousProjects.current = projects;
  }, [projects]);
  useEffect(() => {
    if (previousMode.current !== mode) heading.current?.focus();
    previousMode.current = mode;
  }, [mode]);
  // Return focus to the list when the delete dialog closes (cancel or after
  // the delete completes), matching the previous native-dialog behavior.
  const previousDeleteTarget = useRef(deleteTarget);
  useEffect(() => {
    if (previousDeleteTarget.current && !deleteTarget) {
      const trigger = deleteTrigger.current;
      if (trigger?.isConnected) trigger.focus();
      else heading.current?.focus();
    }
    previousDeleteTarget.current = deleteTarget;
  }, [deleteTarget]);

  async function saveForm(): Promise<boolean> {
    // The ref flips synchronously, so a fast second submit cannot slip through
    // the gap before React re-renders with the pending flag.
    if (submitting.current || pending) return false;
    clearMessages();
    // Auto-derived slugs dedupe against existing projects (and suffix on
    // collision), so a repeated title never blocks the user.
    const effectiveSlug =
      mode === "create"
        ? slugTouched
          ? values.slug
          : generateSlug(
              [values.title],
              projects.map((project) => project.slug)
            )
        : "";
    if (mode === "create" && !isSlug(effectiveSlug)) {
      setError(
        "Add a title, or set a link address under Advanced using lowercase letters, numbers, and single hyphens (1–100 characters), with no surrounding spaces."
      );
      return false;
    }
    const parsed = parseProjectForm(values, mode === "edit" ? editing : null);
    if (parsed.values === null) {
      setError(parsed.error);
      return false;
    }
    if (mode === "edit" && editing) {
      const body = projectUpdateBody(parsed.values, {
        ...editing,
        highlights: editing.highlights ?? [],
      });
      if (!body) {
        setSuccess(PROJECT_NO_CHANGES_MESSAGE);
        return true;
      }
      submitting.current = true;
      try {
        await updateMutation.mutateAsync({ slug: editing.slug, body });
        submitting.current = false;
        setMode("list");
        setEditing(null);
        setSuccess("Project draft saved.");
        return true;
      } catch (err) {
        submitting.current = false;
        const error = err as ApiError;
        setAuthError(error.status === 401 || error.status === 403);
        setError(error.message);
        return false;
      }
    }
    submitting.current = true;
    try {
      await createMutation.mutateAsync({
        slug: effectiveSlug,
        ...parsed.values,
      });
      submitting.current = false;
      setMode("list");
      setValues(blankProjectForm());
      setSlugTouched(false);
      setSuccess("Project created in your draft.");
      return true;
    } catch (err) {
      submitting.current = false;
      const error = err as ApiError;
      setAuthError(error.status === 401 || error.status === 403);
      setError(error.message);
      return false;
    }
  }
  async function saveAll(): Promise<boolean> {
    let ok = true;
    if (mode !== "list") ok = await saveForm();
    const changed = changedOrders(projects, orders);
    if (changed.orders && changed.orders.length > 0) {
      const submitted = changed.orders;
      try {
        await reorderMutation.mutateAsync(submitted);
        setOrders((drafts) =>
          Object.fromEntries(
            Object.entries(drafts).filter(
              ([slug]) => !submitted.some((entry) => entry.slug === slug)
            )
          )
        );
        setSuccess("Order saved to your draft.");
      } catch (err) {
        const error = err as ApiError;
        setAuthError(error.status === 401 || error.status === 403);
        setError(error.message);
        ok = false;
      }
    } else if (changed.orders === null) {
      setError(changed.error ?? "Invalid display order.");
      ok = false;
    }
    return ok;
  }
  function discardEdits() {
    if (mode !== "list") {
      setMode("list");
      setEditing(null);
    }
    setSlugTouched(false);
    setOrders({});
    clearMessages();
  }
  async function confirmDelete() {
    if (!deleteTarget || pending) return;
    const target = deleteTarget;
    try {
      await deleteMutation.mutateAsync(target.slug);
      setDeleteTarget(null);
      setSuccess("Project deleted from your draft.");
    } catch (err) {
      const error = err as ApiError;
      setAuthError(error.status === 401 || error.status === 403);
      setError(error.message);
    }
  }
  const orderChanges = changedOrders(projects, orders);
  // Semantic "unsaved edits" signal for the wizard's step-leave guard: covers
  // the open form (including invalid input) and unsaved order drafts alike.
  const editsPending =
    projectEditsPending(mode, values, editing) ||
    orderChanges.orders === null ||
    (orderChanges.orders?.length ?? 0) > 0;
  useStepEdits({
    dirty: editsPending,
    save: saveAll,
    discard: discardEdits,
    onDirtyChange,
    onControls,
  });
  const inputClass =
    "min-h-11 w-full min-w-0 rounded-md border border-input px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  const messages = (
    <>
      {error ? (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-destructive p-4 text-sm [overflow-wrap:anywhere]"
        >
          <p>{error}</p>
          {authError ? (
            <Link
              href="/auth/signin"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded underline focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              Sign in again (new tab)
            </Link>
          ) : null}
        </div>
      ) : null}
      {success ? (
        <p
          role="status"
          className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 [overflow-wrap:anywhere] dark:text-emerald-300"
        >
          {success}
        </p>
      ) : null}
    </>
  );

  return (
    <section
      aria-label="Project management"
      className="space-y-6"
      aria-busy={pending}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {headingLevel === "h3" ? (
          <h3
            ref={heading}
            tabIndex={-1}
            className="rounded text-xl font-bold focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {mode === "create"
              ? "Add project"
              : mode === "edit"
                ? "Edit project"
                : "Projects"}
          </h3>
        ) : (
          <h2
            ref={heading}
            tabIndex={-1}
            className="rounded text-xl font-bold focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {mode === "create"
              ? "Add project"
              : mode === "edit"
                ? "Edit project"
                : "Projects"}
          </h2>
        )}
        {mode === "list" ? (
          <Button
            ref={addButton}
            size="lg"
            disabled={pending || Boolean(deleteTarget)}
            onClick={() => {
              clearMessages();
              setValues(blankProjectForm());
              setEditing(null);
              setMode("create");
            }}
          >
            Add project
          </Button>
        ) : null}
      </div>
      {mode !== "list" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveForm();
          }}
          className="space-y-5"
          noValidate
        >
          {mode === "edit" ? (
            <p className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
              Editing “{editing?.title}”. Leave a URL blank to clear it.
            </p>
          ) : null}
          {mode === "edit" && editing ? (
            <ProjectScreenshotControl
              key={editing.slug}
              project={
                projects.find((project) => project.slug === editing.slug) ??
                editing
              }
              disabled={formBusy}
              onBusyChange={onScreenshotBusy}
            />
          ) : null}
          {mode === "create" ? (
            <details className="text-sm">
              <summary className="w-fit cursor-pointer rounded text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4">
                Advanced
              </summary>
              <div className="mt-2">
                <label
                  htmlFor="project-slug"
                  className="mb-1 block text-sm font-medium"
                >
                  Link address (slug)
                </label>
                <input
                  id="project-slug"
                  className={inputClass}
                  value={slugTouched ? values.slug : slugify(values.title)}
                  maxLength={100}
                  disabled={pending}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setValues({ ...values, slug: event.target.value });
                  }}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Created for you from the title. Only change it if you need an
                  exact address.
                </p>
                {slugTouched && !isSlug(values.slug) ? (
                  <p role="alert" className="mt-1 text-sm text-destructive">
                    Slug must use lowercase letters, numbers, and single hyphens
                    (1–100 characters), with no surrounding spaces.
                  </p>
                ) : null}
              </div>
            </details>
          ) : null}
          <div>
            <label
              htmlFor="project-title"
              className="mb-1 block text-sm font-medium"
            >
              Title
            </label>
            <input
              id="project-title"
              className={inputClass}
              value={values.title}
              maxLength={200}
              disabled={pending}
              onChange={(event) =>
                setValues({ ...values, title: event.target.value })
              }
            />
          </div>
          <div>
            <label
              htmlFor="project-summary"
              className="mb-1 block text-sm font-medium"
            >
              Summary
            </label>
            <textarea
              id="project-summary"
              className={`${inputClass} min-h-28`}
              value={values.summary}
              maxLength={1000}
              disabled={pending}
              onChange={(event) =>
                setValues({ ...values, summary: event.target.value })
              }
            />
            <FieldAiWriting
              section="projects"
              field="summary"
              ownerId={ownerId}
              currentText={values.summary}
              facts={manualFacts("projects", "summary", {
                title: values.title,
                technologies: values.technologies,
                highlights: values.highlights,
              })}
              disabled={pending}
              onUse={(text) => setValues({ ...values, summary: text })}
            />
          </div>
          <div>
            <label
              htmlFor="project-technologies"
              className="mb-1 block text-sm font-medium"
            >
              Technologies
            </label>
            <input
              id="project-technologies"
              className={inputClass}
              value={values.technologies}
              disabled={pending}
              onChange={(event) =>
                setValues({ ...values, technologies: event.target.value })
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Comma-separated, 0–20 unique items. Leave blank for none.
            </p>
          </div>
          <div>
            <label
              htmlFor="project-highlights"
              className="mb-1 block text-sm font-medium"
            >
              Highlights
            </label>
            <textarea
              id="project-highlights"
              className={`${inputClass} min-h-24`}
              value={values.highlights}
              disabled={pending}
              onChange={(event) =>
                setValues({ ...values, highlights: event.target.value })
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              One bullet per line, 0–20 unique items of up to 500 characters.
              Leave blank for none.
            </p>
          </div>
          <div>
            <label
              htmlFor="project-repository"
              className="mb-1 block text-sm font-medium"
            >
              Repository URL (optional)
            </label>
            <input
              id="project-repository"
              className={inputClass}
              value={values.repository_url}
              maxLength={1024}
              disabled={pending}
              onChange={(event) =>
                setValues({ ...values, repository_url: event.target.value })
              }
            />
          </div>
          <div>
            <label
              htmlFor="project-demo"
              className="mb-1 block text-sm font-medium"
            >
              Demo URL (optional)
            </label>
            <input
              id="project-demo"
              className={inputClass}
              value={values.demo_url}
              maxLength={1024}
              disabled={pending}
              onChange={(event) =>
                setValues({ ...values, demo_url: event.target.value })
              }
            />
          </div>
          <div>
            <label
              htmlFor="project-order"
              className="mb-1 block text-sm font-medium"
            >
              Sort priority
            </label>
            <input
              id="project-order"
              aria-describedby="project-order-help"
              type="number"
              min={0}
              max={MAX_ORDER}
              step={1}
              className={inputClass}
              value={values.display_order}
              disabled={pending}
              onChange={(event) =>
                setValues({ ...values, display_order: event.target.value })
              }
            />
            <p
              id="project-order-help"
              className="mt-1 text-xs text-muted-foreground"
            >
              Lower values appear first. Use the project list’s position
              controls to choose an exact place in the list.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ProjectSaveButton
              mode={mode === "create" ? "create" : "edit"}
              saving={saving}
              disabled={formBusy}
            />
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setMode("list");
                clearMessages();
              }}
            >
              Cancel
            </Button>
          </div>
          {!deleteTarget ? messages : null}
        </form>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              variant="outline"
              disabled={pending || projectsQuery.isFetching}
              onClick={() => void projectsQuery.refetch()}
            >
              {projectsQuery.isFetching ? "Loading…" : "Refresh projects"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Move projects up or down, or choose a position. Preview the order,
            then save it with the step&apos;s Save changes button below.
          </p>
          {listStatus === "unavailable" ? (
            <p role="status" className="text-sm text-destructive">
              Projects unavailable. Any cards below are from the last successful
              load. Use Refresh projects to retry.
            </p>
          ) : null}
          {!projects.length && listStatus === "ok" ? (
            <p className="py-8 text-sm text-muted-foreground">
              No projects yet. Add one above.
            </p>
          ) : null}
          <div className="space-y-4">
            {orderedProjects(projects, orders).map((project, index, list) => {
              const thumbnail = profileImageUrl(
                project.screenshot_url,
                project.screenshot_updated_at,
                `/api/projects/${encodeURIComponent(project.slug)}/screenshot`
              );
              const move = (position: number) => {
                clearMessages();
                setOrders((drafts) =>
                  moveProjectToPosition(
                    projects,
                    drafts,
                    project.slug,
                    position
                  )
                );
              };
              return (
                <Card key={project.id} className="min-w-0 p-4 sm:p-5">
                  <div className="grid min-w-0 grid-cols-[80px_minmax(0,1fr)] items-start gap-4 sm:grid-cols-[112px_minmax(0,1fr)]">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-md border bg-muted">
                      {thumbnail ? (
                        <Image
                          src={thumbnail}
                          alt={`${project.title} screenshot`}
                          fill
                          sizes="(min-width: 640px) 112px, 80px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
                          No screenshot
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">
                          {project.title}
                        </h3>
                        {project.is_sample ? (
                          <Badge variant="outline">Sample</Badge>
                        ) : null}
                      </div>
                      {!/^import-[0-9a-f]{16,}$/i.test(project.slug) && (
                        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                          {project.slug}
                        </p>
                      )}
                      <p className="line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                        {project.summary}
                      </p>
                    </div>
                    <div className="col-span-2 min-w-0 space-y-2 sm:col-span-1 sm:col-start-2">
                      <div className="flex min-w-0 flex-wrap gap-2">
                        {project.technologies.slice(0, 4).map((tech, i) => (
                          <Badge
                            key={`${tech}-${i}`}
                            variant="outline"
                            className="max-w-full whitespace-normal [overflow-wrap:anywhere]"
                          >
                            {tech}
                          </Badge>
                        ))}
                      </div>
                      {project.technologies.length > 4 ? (
                        <details>
                          <summary className="w-fit cursor-pointer rounded text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">
                            Show {project.technologies.length - 4} more
                            technologies
                          </summary>
                          <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                            {project.technologies.slice(4).map((tech, i) => (
                              <Badge
                                key={`${tech}-${i}`}
                                variant="outline"
                                className="max-w-full whitespace-normal [overflow-wrap:anywhere]"
                              >
                                {tech}
                              </Badge>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        htmlFor={`position-${project.id}`}
                        className="text-xs font-medium"
                      >
                        Position{" "}
                        <span className="sr-only">for {project.title}</span>
                      </label>
                      <select
                        id={`position-${project.id}`}
                        value={index}
                        disabled={pending}
                        onChange={(event) => move(Number(event.target.value))}
                        className="h-11 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {list.map((item, position) => (
                          <option key={item.id} value={position}>
                            {position + 1} of {list.length}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-11 w-11"
                        disabled={pending || index === 0}
                        onClick={() => move(index - 1)}
                        aria-label={`Move ${project.title} up`}
                        title="Move up"
                      >
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-11 w-11"
                        disabled={pending || index === list.length - 1}
                        onClick={() => move(index + 1)}
                        aria-label={`Move ${project.title} down`}
                        title="Move down"
                      >
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {safeProjectLink(project.repository_url) ? (
                        <a
                          href={project.repository_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center rounded text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
                        >
                          Repository
                        </a>
                      ) : null}
                      {safeProjectLink(project.demo_url) ? (
                        <a
                          href={project.demo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center rounded text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
                        >
                          Demo
                        </a>
                      ) : null}
                      <RecordActionButtons
                        recordTitle={project.title}
                        onEdit={() => {
                          setEditing(project);
                          setValues(projectFormFor(project));
                          clearMessages();
                          setMode("edit");
                        }}
                        onDelete={(trigger) => {
                          deleteTrigger.current = trigger;
                          setDeleteTarget(project);
                          clearMessages();
                        }}
                        disabled={pending}
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          <div className="sticky bottom-4 z-10 space-y-3 rounded-lg border bg-background p-4 shadow-md">
            {!deleteTarget ? messages : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p role="status" className="text-sm text-muted-foreground">
                {orderChanges.error ??
                  (orderChanges.orders?.length
                    ? "Order preview — changes are not saved yet."
                    : "Showing the saved project order.")}
              </p>
              <div className="flex flex-wrap gap-2">
                {orderChanges.error || orderChanges.orders?.length ? (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={pending}
                    onClick={() => {
                      setOrders({});
                      clearMessages();
                    }}
                  >
                    Discard order changes
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </>
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={
          deleteTarget ? `Delete “${deleteTarget.title}”?` : "Delete project?"
        }
        description="This cannot be undone."
        confirmLabel="Delete project"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!pending) setDeleteTarget(null);
        }}
        pending={pending}
        pendingLabel="Deleting…"
      >
        {deleteTarget ? messages : null}
      </ConfirmDialog>
    </section>
  );
}
