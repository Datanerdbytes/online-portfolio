import { notFound } from "next/navigation";
import { API_BASE_URL, type ApiResume, type ProjectsResponse } from "@/lib/api";
import { resolveAccountResume } from "@/lib/resume";
import { ResumeDocument } from "@/components/resume-document";

export const dynamic = "force-dynamic";
export const metadata = { title: "Public resume and projects" };

async function loadPortfolio(userId: string) {
  const base = `${API_BASE_URL}/api/v1/public/users/${encodeURIComponent(userId)}`;
  try {
    const [resumeResponse, projectsResponse] = await Promise.all([
      fetch(`${base}/resume`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${base}/projects`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }),
    ]);
    if (resumeResponse.status === 404 || projectsResponse.status === 404)
      return { missing: true as const };
    if (!resumeResponse.ok || !projectsResponse.ok) return null;
    return {
      resume: resolveAccountResume((await resumeResponse.json()) as ApiResume),
      projects: (await projectsResponse.json()) as ProjectsResponse,
    };
  } catch {
    return null;
  }
}

export default async function PublicPortfolio({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  if (!/^[a-zA-Z0-9-]{1,128}$/.test(userId)) notFound();
  const data = await loadPortfolio(userId);
  if (!data)
    return (
      <section className="public-portfolio">
        <div className="content-width">
          <p role="alert" className="resume-notice">
            Portfolio is temporarily unavailable. Please retry.
          </p>
        </div>
      </section>
    );
  if ("missing" in data) notFound();
  if (!data.resume)
    return (
      <section className="public-portfolio">
        <div className="content-width">
          <p role="status" className="resume-notice">
            This portfolio has no resume yet.
          </p>
        </div>
      </section>
    );
  return (
    <section className="public-portfolio" aria-label="Shared portfolio">
      <div className="content-width">
        <p className="eyebrow public-portfolio-label">Shared portfolio</p>
        <div className="resume-shell">
          <ResumeDocument resume={data.resume} projects={data.projects.items} />
        </div>
      </div>
    </section>
  );
}
