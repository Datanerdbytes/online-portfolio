import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { MermaidReadme } from "@/components/mermaid-readme";
import { API_BASE_URL, isProject, type Project } from "@/lib/api";
import { staticResumeProjects } from "@/lib/resume";

interface Props {
  params: Promise<{ slug: string }>;
}

const REQUEST_TIMEOUT_MS = 5000;

async function getProject(slug: string): Promise<Project | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/public/projects/${encodeURIComponent(slug)}`,
      {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        next: { revalidate: 300 },
      }
    );
    if (!response.ok) return null;

    const project: unknown = await response.json();
    return isProject(project) ? project : null;
  } catch {
    return null;
  }
}

async function getReadmeFromBackend(
  projectSlug: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/github/projects/${encodeURIComponent(projectSlug)}/readme`,
      {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        next: { revalidate: 3600 },
      }
    );
    if (!response.ok) return null;

    const html = await response.text();
    return html.length > 0 ? html : null;
  } catch {
    return null;
  }
}

function ReadmeSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading project README"
      aria-busy="true"
      className="animate-pulse space-y-4 motion-reduce:animate-none"
    >
      <div className="h-6 w-1/4 bg-muted" />
      <div className="h-4 w-full bg-muted" />
      <div className="h-4 w-5/6 bg-muted" />
      <div className="h-4 w-4/5 bg-muted" />
    </div>
  );
}

function ReadmeUnavailable({
  repositoryUrl,
}: {
  repositoryUrl: string | null;
}) {
  return (
    <div role="status" className="readme-unavailable">
      <p>The project README is unavailable right now.</p>
      {repositoryUrl ? (
        <a href={repositoryUrl} target="_blank" rel="noopener noreferrer">
          View README on GitHub
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}

async function ProjectReadme({
  projectSlug,
  projectPromise,
}: {
  projectSlug: string;
  projectPromise: Promise<Project | null>;
}) {
  const readmePromise = getReadmeFromBackend(projectSlug);
  const [project, htmlContent] = await Promise.all([
    projectPromise,
    readmePromise,
  ]);
  const fallbackProject = staticResumeProjects().find(
    (item) => item.slug === projectSlug
  );
  const repositoryUrl =
    project?.repository_url ?? fallbackProject?.repository_url ?? null;

  if (!htmlContent) {
    return <ReadmeUnavailable repositoryUrl={repositoryUrl} />;
  }

  return (
    <div className="project-readme">
      <MermaidReadme html={htmlContent} />
    </div>
  );
}

function ProjectMetadataSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mt-6 animate-pulse space-y-3 motion-reduce:animate-none"
    >
      <div className="h-4 w-4/5 bg-muted" />
      <div className="h-4 w-1/3 bg-muted" />
    </div>
  );
}

async function ProjectMetadata({
  projectSlug,
  projectPromise,
}: {
  projectSlug: string;
  projectPromise: Promise<Project | null>;
}) {
  const project = await projectPromise;
  const fallbackProject = staticResumeProjects().find(
    (item) => item.slug === projectSlug
  );
  const details = project ?? fallbackProject;

  if (!details) {
    return (
      <p role="status" className="detail-missing">
        Project details could not be loaded. The README may still be available
        below.
      </p>
    );
  }

  return (
    <>
      <p className="detail-summary">{details.summary}</p>
      <section aria-labelledby="project-technologies-heading">
        <h2 id="project-technologies-heading" className="sr-only">
          Technologies explored
        </h2>
        {details.technologies.length > 0 ? (
          <ul className="detail-tags">
            {details.technologies.map((technology) => (
              <li key={technology}>{technology}</li>
            ))}
          </ul>
        ) : (
          <p className="detail-missing mt-6">
            No technologies have been listed for this project yet.
          </p>
        )}
      </section>
      {details.repository_url ? (
        <div className="detail-actions">
          <a
            href={details.repository_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            View source code
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </div>
      ) : null}
    </>
  );
}

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function ProjectTitle({
  projectSlug,
  projectPromise,
}: {
  projectSlug: string;
  projectPromise: Promise<Project | null>;
}) {
  const project = await projectPromise;
  const fallbackProject = staticResumeProjects().find(
    (item) => item.slug === projectSlug
  );

  return (
    <h1 className="detail-title">
      {project?.title ?? fallbackProject?.title ?? titleFromSlug(projectSlug)}
    </h1>
  );
}

function ProjectTitleSkeleton({ slug }: { slug: string }) {
  const fallbackProject = staticResumeProjects().find(
    (item) => item.slug === slug
  );

  return (
    <h1 className="detail-title">
      {fallbackProject?.title ?? titleFromSlug(slug)}
    </h1>
  );
}

export default async function ProjectDetailPage({ params }: Props) {
  const { slug } = await params;
  const projectPromise = getProject(slug);

  return (
    <div className="project-detail">
      <div className="content-width">
        <header className="project-detail-head">
          <Link href="/#projects" className="detail-back">
            <ArrowLeft size={14} aria-hidden="true" />
            Back to selected work
          </Link>
          <p className="detail-eyebrow">Case study</p>
          <Suspense fallback={<ProjectTitleSkeleton slug={slug} />}>
            <ProjectTitle projectSlug={slug} projectPromise={projectPromise} />
          </Suspense>
          <Suspense fallback={<ProjectMetadataSkeleton />}>
            <ProjectMetadata
              projectSlug={slug}
              projectPromise={projectPromise}
            />
          </Suspense>
        </header>

        <section aria-labelledby="project-readme-heading">
          <div className="readme-card">
            <h2 id="project-readme-heading" className="readme-label">
              README &amp; documentation
            </h2>
            <Suspense fallback={<ReadmeSkeleton />}>
              <ProjectReadme
                projectSlug={slug}
                projectPromise={projectPromise}
              />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}
