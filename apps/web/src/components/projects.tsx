"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CodeXml, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isProjectsResponse, type Project } from "@/lib/api";

const PROJECTS_TIMEOUT_MS = 8000;
const SKELETON_COUNT = 3;

type ProjectsState =
  | { status: "idle" | "loading" }
  | { status: "ok"; items: Project[]; source: "api" | "fallback" }
  | { status: "empty" }
  | { status: "unavailable" };

function isAbsoluteHttpUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function ProjectSkeleton() {
  return (
    <Card className="project-card">
      <div className="project-visual" aria-hidden="true">
        <Skeleton className="h-8 w-12" />
      </div>
      <CardHeader>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="mt-2 h-4 w-full">
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      </CardHeader>
      <CardFooter>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-6 w-20" />
          ))}
        </div>
      </CardFooter>
    </Card>
  );
}

function ProjectLinks({ project }: { project: Project }) {
  const links = [
    { label: "Repository", url: project.repository_url },
    { label: "Demo", url: project.demo_url },
  ] as { label: string; url: string | null }[];

  const validLinks = links.filter(
    (link): link is { label: string; url: string } =>
      isAbsoluteHttpUrl(link.url),
  );

  if (validLinks.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {validLinks.map((link) => (
        <a
          key={link.label}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Card key={project.id} className="project-card flex min-w-0 flex-col">
      <div className="project-visual" aria-hidden="true">
        <CodeXml size={31} strokeWidth={1.3} />
        <span>PORTFOLIO / PROJECT</span>
        <FolderOpen size={24} strokeWidth={1.3} />
      </div>
      <CardHeader>
        <div className="flex flex-col gap-2 min-w-0">
          <h3 className="min-w-0 break-words">{project.title}</h3>
          {project.is_sample && (
            <Badge variant="outline" className="w-fit">
              Sample
            </Badge>
          )}
        </div>
        <CardDescription className="break-words text-[13px] leading-relaxed">
          {project.summary}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2 min-w-0">
          {project.technologies.map((tech) => (
            <Badge key={tech} variant="outline" className="min-w-0 max-w-full">
              <span className="min-w-0 [overflow-wrap:anywhere]">{tech}</span>
            </Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter className="mt-auto pt-0">
        <ProjectLinks project={project} />
      </CardFooter>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="project-state">
      <FolderOpen size={25} className="mb-4 text-primary" aria-hidden="true" />
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
      <FolderOpen size={25} className="mb-4 text-primary" aria-hidden="true" />
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
        : { status: "unavailable" },
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
      const response = await fetch("/api/projects", {
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
          : { status: "ok", items: body.items, source: "api" },
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
        <p role="status" className="mb-4 text-sm text-muted-foreground">
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
          state.items.map((project) => (
            <ProjectCard key={project.id} project={project} />
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
