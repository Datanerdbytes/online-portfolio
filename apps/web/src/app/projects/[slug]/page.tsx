import { Suspense } from "react";
import Link from "next/link";
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
      className="mt-4 animate-pulse space-y-4 motion-reduce:animate-none"
    >
      <div className="h-6 w-1/4 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-800" />
      <div className="h-4 w-5/6 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="h-4 w-4/5 rounded bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}

function ReadmeUnavailable({
  repositoryUrl,
}: {
  repositoryUrl: string | null;
}) {
  return (
    <div
      role="status"
      className="rounded-xl border border-border bg-muted/40 p-6 text-center"
    >
      <p className="mb-4 text-sm text-muted-foreground">
        The project README is unavailable right now.
      </p>
      {repositoryUrl ? (
        <a
          href={repositoryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View README on GitHub
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
    <div
      className="project-readme
        prose max-w-none break-words dark:prose-invert
        [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:border-b [&_h1]:border-border [&_h1]:pb-2 [&_h1]:text-2xl [&_h1]:font-bold
        [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold
        [&_p]:mb-4 [&_p]:leading-relaxed
        [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6
        [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6
        [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:p-4
        [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto
        [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4
      "
    >
      <MermaidReadme html={htmlContent} />
    </div>
  );
}

function ProjectMetadataSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-3">
      <div className="h-4 w-4/5 rounded bg-muted" />
      <div className="h-4 w-1/3 rounded bg-muted" />
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
      <p role="status" className="text-sm text-muted-foreground">
        Project details could not be loaded. The README may still be available
        below.
      </p>
    );
  }

  return (
    <>
      <p className="mb-5 max-w-3xl break-words text-muted-foreground">
        {details.summary}
      </p>
      <section
        aria-labelledby="project-technologies-heading"
        className="border-b border-border pb-6"
      >
        <h2
          id="project-technologies-heading"
          className="mb-3 text-sm font-semibold text-foreground"
        >
          Technologies Explored
        </h2>
        {details.technologies.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {details.technologies.map((technology) => (
              <li
                key={technology}
                className="max-w-full break-words rounded-full border border-border bg-muted px-3 py-1 text-sm text-foreground"
              >
                {technology}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No technologies have been listed for this project yet.
          </p>
        )}
      </section>
      {details.repository_url ? (
        <a
          href={details.repository_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View Repository Source Code
        </a>
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
    <h1 className="mb-4 break-words text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
      {project?.title ?? fallbackProject?.title ?? titleFromSlug(projectSlug)}
    </h1>
  );
}

function ProjectTitleSkeleton({ slug }: { slug: string }) {
  const fallbackProject = staticResumeProjects().find(
    (item) => item.slug === slug
  );

  return (
    <h1 className="mb-4 break-words text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
      {fallbackProject?.title ?? titleFromSlug(slug)}
    </h1>
  );
}

export default async function ProjectDetailPage({ params }: Props) {
  const { slug } = await params;
  const projectPromise = getProject(slug);

  return (
    <main className="min-h-screen min-w-0 bg-background px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <article className="mx-auto min-w-0 max-w-4xl rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8 lg:p-10">
        <header className="mb-8 min-w-0">
          <Link
            href="/#projects"
            className="mb-6 inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true" className="mr-2">
              ←
            </span>
            Back to Projects
          </Link>

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

        <section
          aria-labelledby="project-readme-heading"
          className="min-w-0 pt-2"
        >
          <h2
            id="project-readme-heading"
            className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Project Case Study &amp; Documentation
          </h2>
          <Suspense fallback={<ReadmeSkeleton />}>
            <ProjectReadme projectSlug={slug} projectPromise={projectPromise} />
          </Suspense>
        </section>
      </article>
    </main>
  );
}
