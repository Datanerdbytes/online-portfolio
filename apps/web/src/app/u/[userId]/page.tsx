import { notFound } from "next/navigation";
import { resolveAccountResume } from "@/lib/resume";
import {
  getProjectsState,
  loadPublicResumeSections,
} from "@/lib/resume-server";
import { ResumeDocument } from "@/components/resume-document";

export const dynamic = "force-dynamic";
export const metadata = { title: "Public resume and projects" };

async function loadPortfolio(userId: string) {
  const [sections, projects] = await Promise.all([
    loadPublicResumeSections(userId),
    getProjectsState(userId),
  ]);
  if (sections.status === "missing" || projects.status === "missing")
    return { missing: true as const };
  if (sections.status === "unavailable" || projects.status === "unavailable")
    return null;
  return {
    resume: resolveAccountResume(sections.data),
    projects: projects.data,
  };
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
          <ResumeDocument resume={data.resume} projects={data.projects} />
        </div>
      </div>
    </section>
  );
}
