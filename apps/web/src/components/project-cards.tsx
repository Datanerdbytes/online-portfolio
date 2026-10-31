import Image from "next/image";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { Project } from "@/lib/api";
import { profileImageUrl } from "@/lib/avatar";

function isAbsoluteHttpUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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

export function ProjectCard({
  project,
  index,
  detailHref,
}: {
  project: Project;
  index: number;
  /** Pass `null` to render the card without links (e.g. an owner-scoped list). */
  detailHref?: string | null;
}) {
  const screenshotSrc = profileImageUrl(
    project.screenshot_url,
    project.screenshot_updated_at,
    project.screenshot_url?.startsWith("/api/v1/public/")
      ? project.screenshot_url.replace("/api/v1/", "/api/")
      : `/api/public/projects/${encodeURIComponent(project.slug)}/screenshot`
  );
  const href =
    detailHref === undefined
      ? `/projects/${encodeURIComponent(project.slug)}`
      : detailHref;
  const number = String(index + 1).padStart(2, "0");
  const cover = screenshotSrc ? (
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
  );

  return (
    <article className="project-card">
      {href ? (
        <Link
          href={href}
          className="project-cover"
          aria-label={`Open case study: ${project.title}`}
        >
          {cover}
        </Link>
      ) : (
        <div className="project-cover">{cover}</div>
      )}

      <div className="project-topline">
        <span>Project {number}</span>
        {project.is_sample ? (
          <span className="project-badge">Sample</span>
        ) : null}
      </div>

      <h3 className="project-title">
        {href ? <Link href={href}>{project.title}</Link> : project.title}
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
        {href && (
          <Link href={href} className="project-link">
            View case study
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
        <ProjectLinks project={project} />
      </div>
    </article>
  );
}
