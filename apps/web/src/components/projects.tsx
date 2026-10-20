"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isProjectsResponse, type Project } from "@/lib/api";

const PROJECTS_TIMEOUT_MS = 8000;
const SKELETON_COUNT = 3;

type ProjectsState =
  | { status: "idle" | "loading" }
  | { status: "ok"; items: Project[] }
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
    <Card>
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
      isAbsoluteHttpUrl(link.url)
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
          className="text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Card key={project.id} className="row-span-3 grid min-w-0 grid-cols-1 grid-rows-subgrid gap-0">
      <CardHeader>
        <div className="flex flex-col gap-2 min-w-0">
          <CardTitle className="min-w-0 break-words">{project.title}</CardTitle>
          {project.is_sample && <Badge variant="outline" className="w-fit">Sample</Badge>}
        </div>
        <CardDescription className="break-words">{project.summary}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2 min-w-0">
          {project.technologies.map((tech) => (
            <Badge
              key={tech}
              variant="outline"
              className="min-w-0 max-w-full"
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">{tech}</span>
            </Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        <ProjectLinks project={project} />
      </CardFooter>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
      <Alert>
        <AlertTitle>No projects</AlertTitle>
        <AlertDescription>
          The backend returned no project entries. Add development data to see
          projects here.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function UnavailableState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
      <Alert variant="destructive">
        <AlertTitle>Projects unavailable</AlertTitle>
        <AlertDescription>
          The project list could not be loaded. The rest of the page still
          works.
        </AlertDescription>
      </Alert>
      <Button onClick={onRetry} className="mt-4">
        Retry
      </Button>
    </div>
  );
}

export function ProjectsClient() {
  const [state, setState] = useState<ProjectsState>({ status: "idle" });
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

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
        setState({ status: "unavailable" });
        return;
      }
      const body = (await response.json()) as unknown;
      if (!isProjectsResponse(body)) {
        setState({ status: "unavailable" });
        return;
      }
      if (requestId !== requestIdRef.current) return;
      setState(
        body.items.length === 0
          ? { status: "empty" }
          : { status: "ok", items: body.items }
      );
    } catch {
      if (requestId !== requestIdRef.current) return;
      setState({ status: "unavailable" });
    } finally {
      if (timeout !== null) clearTimeout(timeout);
    }
  }, []);

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
          ? `${state.items.length} projects loaded`
          : "Loading projects";

  return (
    <div>
      <span aria-live="polite" className="sr-only">
        {statusMessage}
      </span>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
