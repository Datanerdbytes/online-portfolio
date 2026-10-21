"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordActionButtons } from "@/components/record-action-buttons";
import type { Project } from "@/lib/api";
import { useDeleteProject, useUpdateProject, type ApiError } from "@/lib/project-queries";
import {
  changedOrders, failure, isProject, isProjectsResponse, isSlug, LatestProjectRequest, MAX_ORDER,
  formTechnologies, parseOrder, safeProjectLink,
} from "@/lib/project-management";

const TIMEOUT_MS = 10000; // Leaves time for the proxy's 8-second deadline to return a sanitized error.
const HEADERS = { "Content-Type": "application/json", "X-Requested-With": "online-resume-admin" };
type Values = { slug: string; title: string; summary: string; technologies: string; repository_url: string; demo_url: string; display_order: string };
type Status = "loading" | "ok" | "unavailable";
const blank = (): Values => ({ slug: "", title: "", summary: "", technologies: "", repository_url: "", demo_url: "", display_order: "0" });
function valuesFor(project: Project): Values {
  return { slug: project.slug, title: project.title, summary: project.summary, technologies: project.technologies.join(", "),
    repository_url: project.repository_url ?? "", demo_url: project.demo_url ?? "", display_order: String(project.display_order) };
}

export function ProjectManager({ initialProjects, initialListStatus = "ok" }: { initialProjects: Project[]; initialListStatus?: Status }) {
  const [projects, setProjects] = useState(initialProjects);
  const projectsRef = useRef(initialProjects);
  const [listStatus, setListStatus] = useState<Status>(initialListStatus);
  const settledListStatus = useRef<Status>(initialListStatus === "loading" ? "unavailable" : initialListStatus);
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editing, setEditing] = useState<Project | null>(null);
  const [values, setValues] = useState<Values>(blank);
  const [orders, setOrders] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState(false);
  const [success, setSuccess] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const requests = useRef(new LatestProjectRequest());
  const mutation = useRef<AbortController | null>(null);
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();
  const [runPending, setRunPending] = useState(false);
  const pending = runPending || updateMutation.isPending || deleteMutation.isPending;
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousMode = useRef(mode);

  const clearMessages = useCallback(() => { setError(""); setAuthError(false); setSuccess(""); }, []);
  const loadProjects = useCallback(async () => {
    const controller = requests.current.start();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    setListStatus("loading");
    try {
      const response = await fetch("/api/projects", { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("Unavailable");
      const body: unknown = await response.json();
      if (!isProjectsResponse(body)) throw new Error("Invalid project list");
      if (!requests.current.owns(controller)) return;
      const previous = new Map(projectsRef.current.map((project) => [project.slug, project.display_order]));
      setOrders((drafts) => Object.fromEntries(body.items.map((project) => {
        const draft = drafts[project.slug];
        const unsaved = draft !== undefined && draft !== String(previous.get(project.slug));
        return [project.slug, unsaved ? draft : String(project.display_order)];
      })));
      projectsRef.current = body.items;
      setProjects(body.items);
      settledListStatus.current = "ok";
      setListStatus("ok");
    } catch {
      if (requests.current.owns(controller)) {
        settledListStatus.current = "unavailable";
        setListStatus("unavailable");
      }
    } finally {
      clearTimeout(timeout);
      requests.current.finish(controller);
    }
  }, []);

  useEffect(() => {
    const listRequests = requests.current;
    return () => { listRequests.cancel(); const active = mutation.current; mutation.current = null; active?.abort(); };
  }, []);
  useEffect(() => {
    if (previousMode.current !== mode) heading.current?.focus();
    previousMode.current = mode;
  }, [mode]);
  useEffect(() => {
    const element = dialog.current;
    if (deleteTarget && element && !element.open) {
      element.showModal();
      cancelDelete.current?.focus();
    } else if (!deleteTarget && element?.open) {
      element.close();
      const trigger = deleteTrigger.current;
      if (trigger?.isConnected) trigger.focus(); else addButton.current?.focus();
    }
    if (deleteTarget && !pending) cancelDelete.current?.focus();
  }, [deleteTarget, pending]);

  async function runMutation(path: string, method: string, body: unknown, onSuccess: () => void) {
    if (mutation.current) return;
    requests.current.cancel();
    setListStatus(settledListStatus.current);
    const controller = new AbortController();
    mutation.current = controller;
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    setRunPending(true);
    clearMessages();
    try {
      const response = await fetch(path, { method, headers: HEADERS, signal: controller.signal, cache: "no-store",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (mutation.current !== controller) return;
      if (!response.ok) {
        setAuthError([401, 403].includes(response.status));
        setError(failure(response.status));
        return;
      }
      if (method === "DELETE") {
        if (response.status !== 204) throw new Error("Unexpected deletion response");
      } else {
        const result: unknown = await response.json();
        if (method === "POST" && path === "/api/projects/reorder") {
          const expected = (body as { orders: unknown[] }).orders.length;
          if (!result || typeof result !== "object" || !("updated" in result) || result.updated !== expected) throw new Error("Invalid reorder response");
        } else if (!isProject(result)) throw new Error("Invalid project response");
      }
      if (mutation.current !== controller) return;
      onSuccess();
      void loadProjects();
    } catch {
      if (mutation.current === controller) setError("The projects service is unavailable. Your draft is preserved; please try again.");
    } finally {
      clearTimeout(timeout);
      if (mutation.current === controller) { mutation.current = null; setRunPending(false); }
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    clearMessages();
    const title = values.title.trim(), summary = values.summary.trim();
    const technologies = formTechnologies(values.technologies, mode === "edit" ? editing?.technologies : undefined);
    const order = parseOrder(values.display_order);
    const repository = values.repository_url.trim(), demo = values.demo_url.trim();
    if (mode === "create" && !isSlug(values.slug)) { setError("Slug must use lowercase letters, numbers, and single hyphens (1–100 characters), with no surrounding spaces."); return; }
    if (!title || title.length > 200 || !summary || summary.length > 1000) { setError("Title must contain 1–200 characters and summary 1–1000 characters."); return; }
    if (technologies === null) { setError("Use 0–20 unique technologies, each 1–50 characters, separated by commas. Leave blank for none."); return; }
    const repositoryChanged = mode === "create" || repository !== (editing?.repository_url ?? "");
    const demoChanged = mode === "create" || demo !== (editing?.demo_url ?? "");
    if ((repositoryChanged && repository && !safeProjectLink(repository)) || (demoChanged && demo && !safeProjectLink(demo))) { setError("URLs must be absolute HTTP(S) URLs of at most 1024 characters, or blank."); return; }
    if (order === null) { setError("Display order must be a whole number between 0 and 2147483647."); return; }
    const writable = { title, summary, technologies, repository_url: repository || null, demo_url: demo || null, display_order: order };
    if (mode === "edit" && editing) {
      const body = Object.fromEntries(Object.entries(writable).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(editing[key as keyof Project])));
      if (!Object.keys(body).length) { setError("No changes to save."); return; }
      updateMutation.mutate({ slug: editing.slug, body }, {
        onSuccess: (updated) => {
          setProjects((current) => current.map((p) => (p.slug === editing.slug ? updated : p)));
          setMode("list"); setEditing(null); setSuccess("Project saved.");
        },
        onError: (err) => {
          const error = err as ApiError;
          setAuthError(error.status === 401 || error.status === 403);
          setError(error.message);
        },
      });
    } else {
      void runMutation("/api/projects", "POST", { slug: values.slug, ...writable }, () => {
        setMode("list"); setValues(blank()); setSuccess("Project created.");
      });
    }
  }
  function saveOrder() {
    if (pending) return;
    clearMessages();
    const changed = changedOrders(projects, orders);
    if (!changed.orders) { setError(changed.error ?? "Invalid display order."); return; }
    if (!changed.orders.length) return;
    const submitted = new Set(changed.orders.map((entry) => entry.slug));
    void runMutation("/api/projects/reorder", "POST", { orders: changed.orders }, () => {
      setOrders((drafts) => Object.fromEntries(Object.entries(drafts).filter(([slug]) => !submitted.has(slug))));
      setSuccess("Order saved.");
    });
  }
  const orderChanges = changedOrders(projects, orders);
  const inputClass = "min-h-11 w-full min-w-0 rounded-md border border-input px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  const messages = <>{error ? <div role="alert" className="space-y-2 rounded-md border border-destructive p-4 text-sm [overflow-wrap:anywhere]">
    <p>{error}</p>{authError ? <Link href="/auth/signin" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded underline focus-visible:outline-2 focus-visible:outline-offset-4">Sign in again (new tab)</Link> : null}
  </div> : null}{success ? <p role="status" className="text-sm">{success}</p> : null}</>;

  return <section aria-label="Project management" className="space-y-6" aria-busy={pending}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 ref={heading} tabIndex={-1} className="rounded text-xl font-bold focus-visible:outline-2 focus-visible:outline-offset-4">{mode === "create" ? "Add project" : mode === "edit" ? "Edit project" : "Projects"}</h2>
      {mode === "list" ? <Button ref={addButton} size="lg" disabled={pending || Boolean(deleteTarget)} onClick={() => { clearMessages(); setValues(blank()); setEditing(null); setMode("create"); }}>Add project</Button> : null}
    </div>
    {!deleteTarget ? messages : null}
    {mode !== "list" ? <form onSubmit={submit} className="space-y-5" noValidate>
      {mode === "edit" ? <p className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">Editing {editing?.slug}. Leave a URL blank to clear it.</p> : null}
      {mode === "create" ? <div><label htmlFor="project-slug" className="mb-1 block text-sm font-medium">Slug</label><input id="project-slug" className={inputClass} value={values.slug} maxLength={100} disabled={pending} onChange={(event) => setValues({ ...values, slug: event.target.value })} /></div> : null}
      <div><label htmlFor="project-title" className="mb-1 block text-sm font-medium">Title</label><input id="project-title" className={inputClass} value={values.title} maxLength={200} disabled={pending} onChange={(event) => setValues({ ...values, title: event.target.value })} /></div>
      <div><label htmlFor="project-summary" className="mb-1 block text-sm font-medium">Summary</label><textarea id="project-summary" className={`${inputClass} min-h-28`} value={values.summary} maxLength={1000} disabled={pending} onChange={(event) => setValues({ ...values, summary: event.target.value })} /></div>
      <div><label htmlFor="project-technologies" className="mb-1 block text-sm font-medium">Technologies</label><input id="project-technologies" className={inputClass} value={values.technologies} disabled={pending} onChange={(event) => setValues({ ...values, technologies: event.target.value })} /><p className="mt-1 text-xs text-muted-foreground">Comma-separated, 0–20 unique items. Leave blank for none.</p></div>
      <div><label htmlFor="project-repository" className="mb-1 block text-sm font-medium">Repository URL (optional)</label><input id="project-repository" className={inputClass} value={values.repository_url} maxLength={1024} disabled={pending} onChange={(event) => setValues({ ...values, repository_url: event.target.value })} /></div>
      <div><label htmlFor="project-demo" className="mb-1 block text-sm font-medium">Demo URL (optional)</label><input id="project-demo" className={inputClass} value={values.demo_url} maxLength={1024} disabled={pending} onChange={(event) => setValues({ ...values, demo_url: event.target.value })} /></div>
      <div><label htmlFor="project-order" className="mb-1 block text-sm font-medium">Display order</label><input id="project-order" type="number" min={0} max={MAX_ORDER} step={1} className={inputClass} value={values.display_order} disabled={pending} onChange={(event) => setValues({ ...values, display_order: event.target.value })} /></div>
      <div className="flex flex-wrap gap-3"><Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : mode === "create" ? "Create project" : "Save changes"}</Button><Button type="button" size="lg" variant="outline" disabled={pending} onClick={() => { setMode("list"); clearMessages(); }}>Cancel</Button></div>
    </form> : <>
      <div className="flex flex-wrap gap-3"><Button size="lg" variant="outline" disabled={pending || listStatus === "loading"} onClick={() => void loadProjects()}>{listStatus === "loading" ? "Loading…" : "Refresh projects"}</Button><Button size="lg" disabled={pending || Boolean(deleteTarget) || (!orderChanges.error && !orderChanges.orders?.length)} onClick={saveOrder}>{pending ? "Saving…" : "Save order"}</Button></div>
      {listStatus === "unavailable" ? <p role="status" className="text-sm text-destructive">Projects unavailable. Any cards below are from the last successful load. Use Refresh projects to retry.</p> : null}
      {!projects.length && listStatus === "ok" ? <p className="py-8 text-sm text-muted-foreground">No projects yet. Add one above.</p> : null}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">{projects.map((project) => <Card key={project.id} className="flex min-w-0 flex-col">
        <CardHeader><CardTitle className="[overflow-wrap:anywhere]">{project.title}</CardTitle><p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{project.slug}</p>{project.is_sample ? <Badge variant="outline" className="w-fit">Sample</Badge> : null}<CardDescription className="[overflow-wrap:anywhere]">{project.summary}</CardDescription></CardHeader>
        <CardContent className="min-w-0 flex-1 space-y-4"><div className="flex min-w-0 flex-wrap gap-2">{project.technologies.map((tech, index) => <Badge key={`${tech}-${index}`} variant="outline" className="min-w-0 max-w-full whitespace-normal [overflow-wrap:anywhere]">{tech}</Badge>)}</div>
          <div><label htmlFor={`order-${project.id}`} className="mb-1 block text-sm font-medium">Display order <span className="sr-only">for {project.title}</span></label><input id={`order-${project.id}`} type="number" min={0} max={MAX_ORDER} step={1} value={orders[project.slug] ?? String(project.display_order)} disabled={pending} onChange={(event) => setOrders({ ...orders, [project.slug]: event.target.value })} className={inputClass} /></div>
          <div className="flex flex-wrap gap-3">{safeProjectLink(project.repository_url) ? <a href={project.repository_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded text-sm underline focus-visible:outline-2 focus-visible:outline-offset-2">Repository</a> : null}{safeProjectLink(project.demo_url) ? <a href={project.demo_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded text-sm underline focus-visible:outline-2 focus-visible:outline-offset-2">Demo</a> : null}</div>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <RecordActionButtons
            recordTitle={project.title}
            onEdit={() => { setEditing(project); setValues(valuesFor(project)); clearMessages(); setMode("edit"); }}
            onDelete={() => { setDeleteTarget(project); clearMessages(); }}
            disabled={pending}
          />
        </CardFooter>
      </Card>)}</div>
    </>}
    <dialog ref={dialog} aria-labelledby="delete-project-title" onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]');
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && event.target === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && event.target === last) { event.preventDefault(); first.focus(); }
    }} onCancel={(event) => { event.preventDefault(); if (!pending) setDeleteTarget(null); }} className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-lg border bg-background p-6 text-foreground shadow-lg backdrop:bg-black/40">
      <h3 id="delete-project-title" className="mb-3 text-lg font-semibold [overflow-wrap:anywhere]">Delete “{deleteTarget?.title}”?</h3>
      <p className="mb-4 text-sm text-muted-foreground">This cannot be undone.</p>
      {deleteTarget ? messages : null}
      <div className="mt-4 flex flex-wrap gap-3"><Button ref={cancelDelete} size="lg" variant="outline" disabled={pending} onClick={() => setDeleteTarget(null)}>Cancel</Button><Button size="lg" variant="destructive" disabled={pending || !deleteTarget} onClick={() => {
        if (!deleteTarget || pending) return;
        deleteMutation.mutate(deleteTarget.slug, {
          onSuccess: () => {
            setProjects((current) => current.filter((p) => p.slug !== deleteTarget.slug));
            deleteTrigger.current = null; setDeleteTarget(null); setSuccess("Project deleted.");
          },
          onError: (err) => {
            const error = err as ApiError;
            setAuthError(error.status === 401 || error.status === 403);
            setError(error.message);
          },
        });
      }}>{pending ? "Deleting…" : "Delete project"}</Button></div>
    </dialog>
  </section>;
}
