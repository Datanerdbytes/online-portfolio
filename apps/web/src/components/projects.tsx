"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, FolderOpen } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isProjectsResponse, type Project } from "@/lib/api";
import { profileImageUrl } from "@/lib/avatar";

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

function ProjectLinks({ project }: { project: Project }) {
  const links = [
    { label: "Repository", url: project.repository_url },
    { label: "Live demo", url: project.demo_url },
  ] as { label: string; url: string | null }[];

  const validLinks = links.filter(
    (link): link is { label: string; url: string } =>
      isAbsoluteHttpUrl(link.url)
  );

  if (validLinks.length === 0) return null;

  return (
    <div className="project-external">
      {validLinks.map((link) => (
        <a
          key={link.label}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {link.label}
          <ArrowUpRight size={12} aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

const COVER_PATHS = [
  { d: "M0 78 L34 64 L68 70 L102 46 L136 54 L170 24 L204 32 L240 16", y: 16 },
  { d: "M0 82 L30 74 L60 52 L90 60 L120 38 L150 44 L180 20 L240 28", y: 28 },
  { d: "M0 70 L40 72 L80 44 L110 50 L150 30 L190 36 L240 14", y: 14 },
];

function ProjectCoverArt({ number, index }: { number: string; index: number }) {
  const path = COVER_PATHS[index % COVER_PATHS.length];
  return (
    <div className="project-cover-art" aria-hidden="true">
      <span className="project-cover-index">{number}</span>
      <svg
        className="project-cover-graph"
        viewBox="0 0 240 96"
        fill="none"
        aria-hidden="true"
      >
        <path d={`${path.d} V96 H0 Z`} fill="currentColor" opacity="0.09" />
        <path
          d={path.d}
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <circle cx="240" cy={path.y} r="3" fill="currentColor" />
      </svg>
    </div>
  );
}

function ProjectCard({ project, index }: { project: Project; index: number }) {
  const screenshotSrc = profileImageUrl(
    project.screenshot_url,
    project.screenshot_updated_at,
    project.screenshot_url?.startsWith("/api/v1/public/")
      ? project.screenshot_url.replace("/api/v1/", "/api/")
      : `/api/public/projects/${encodeURIComponent(project.slug)}/screenshot`
  );
  const detailHref = `/projects/${encodeURIComponent(project.slug)}`;
  const number = String(index + 1).padStart(2, "0");

  return (
    <article className="project-card">
      <Link
        href={detailHref}
        className="project-cover"
        aria-label={`Open case study: ${project.title}`}
      >
        {screenshotSrc ? (
          <Image
            src={screenshotSrc}
            alt={`${project.title} screenshot`}
            fill
            sizes="(max-width: 767px) calc(100vw - 40px), 560px"
            className="project-cover-image"
            unoptimized
          />
        ) : (
          <ProjectCoverArt number={number} index={index} />
        )}
      </Link>

      <div className="project-topline">
        <span>Project {number}</span>
        {project.is_sample ? (
          <span className="project-badge">Sample</span>
        ) : null}
      </div>

      <h3 className="project-title">
        <Link href={detailHref}>{project.title}</Link>
      </h3>
      <p className="project-summary">{project.summary}</p>

      {project.technologies.length > 0 && (
        <ul className="project-technologies">
          {project.technologies.map((tech) => (
            <li key={tech}>{tech}</li>
          ))}
        </ul>
      )}

      <div className="project-footer">
        <Link href={detailHref} className="project-link">
          View case study
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
        <ProjectLinks project={project} />
      </div>
    </article>
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
