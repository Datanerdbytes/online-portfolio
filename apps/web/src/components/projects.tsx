"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen } from "lucide-react";
import { ProjectCard } from "@/components/project-cards";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isProjectsResponse, type Project } from "@/lib/api";

const PROJECTS_TIMEOUT_MS = 8000;
const SKELETON_COUNT = 3;

type ProjectsState =
  | { status: "idle" | "loading" }
  | { status: "ok"; items: Project[]; source: "api" | "fallback" }
  | { status: "empty" }
  | { status: "unavailable" };

function ProjectSkeleton() {
  return (
    <div className="project-card" aria-hidden="true">
      <div className="project-cover">
        <Skeleton className="h-full w-full rounded-none" />
      </div>
      <div className="project-topline">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="mt-3 h-7 w-4/5" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-11/12" />
      <div className="mt-5 flex flex-wrap gap-2">
        {[1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-6 w-20 rounded-full" />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="project-state">
      <FolderOpen size={24} aria-hidden="true" />
      <h3>Projects are on the way</h3>
      <p>
        There are no published projects to show yet. Check back for updates.
      </p>
    </div>
  );
}

function UnavailableState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="project-state">
      <FolderOpen size={24} aria-hidden="true" />
      <h3>Projects unavailable</h3>
      <p>The project list couldn’t be loaded right now. Please try again.</p>
      <Button variant="outline" onClick={onRetry} className="mt-4">
        Try again
      </Button>
    </div>
  );
}

export function ProjectsClient({
  fallbackItems,
}: {
  fallbackItems?: Project[];
}) {
  const [state, setState] = useState<ProjectsState>({ status: "idle" });
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const fallbackRef = useRef<Project[]>(fallbackItems ?? []);
  useEffect(() => {
    fallbackRef.current = fallbackItems ?? [];
  }, [fallbackItems]);

  const markUnavailable = useCallback(() => {
    const fallback = fallbackRef.current;
    setState(
      fallback.length > 0
        ? { status: "ok", items: fallback, source: "fallback" }
        : { status: "unavailable" }
    );
  }, []);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading" });
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      timeout = setTimeout(() => controller.abort(), PROJECTS_TIMEOUT_MS);
      const response = await fetch("/api/public/projects", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (requestId !== requestIdRef.current) return;
      if (!response.ok) {
        markUnavailable();
        return;
      }
      const body = (await response.json()) as unknown;
      if (!isProjectsResponse(body)) {
        markUnavailable();
        return;
      }
      if (requestId !== requestIdRef.current) return;
      setState(
        body.items.length === 0
          ? { status: "empty" }
          : { status: "ok", items: body.items, source: "api" }
      );
    } catch {
      if (requestId !== requestIdRef.current) return;
      markUnavailable();
    } finally {
      if (timeout !== null) clearTimeout(timeout);
    }
  }, [markUnavailable]);

  useEffect(() => {
    (async () => {
      await load();
    })();
    return () => {
      controllerRef.current?.abort();
    };
  }, [load]);

  const retry = useCallback(() => {
    load();
  }, [load]);

  const pending = state.status === "idle" || state.status === "loading";
  const statusMessage =
    state.status === "unavailable"
      ? "Projects unavailable"
      : state.status === "empty"
        ? "No projects"
        : state.status === "ok"
          ? state.source === "fallback"
            ? `${state.items.length} projects shown from the last synced copy`
            : `${state.items.length} projects loaded`
          : "Loading projects";

  return (
    <div>
      <span aria-live="polite" className="sr-only">
        {statusMessage}
      </span>
      {state.status === "ok" && state.source === "fallback" ? (
        <p role="status" className="project-loading-note">
          Showing the last synced copy of the project list.
        </p>
      ) : null}
      <div className="project-grid" aria-busy={pending}>
        {pending ? (
          <>
            {[...Array(SKELETON_COUNT)].map((_, index) => (
              <ProjectSkeleton key={index} />
            ))}
          </>
        ) : state.status === "ok" ? (
          state.items.map((project, index) => (
            <ProjectCard key={project.id} project={project} index={index} />
          ))
        ) : state.status === "empty" ? (
          <EmptyState />
        ) : (
          <UnavailableState onRetry={retry} />
        )}
      </div>
    </div>
  );
}
