import { workspaceSession } from "@/lib/workspace";
import { loadPortfolioStatus } from "@/lib/portfolio-server";
import { fetchProjects, fetchResume } from "@/lib/api";
import { resolveAccountResume } from "@/lib/resume";
import { ResumeDocument } from "@/components/resume-document";
import { PublicationControls } from "@/components/publication-controls";
import Link from "next/link";

export default async function PreviewPage() {
  const session = await workspaceSession();
  if (!session) return null;
  const status = await loadPortfolioStatus(session.token);
  if (!status)
    return (
      <p role="alert">
        Preview is temporarily unavailable. Your draft is saved.
      </p>
    );
  const content = await Promise.all([
    fetchResume(session.token),
    fetchProjects(session.token),
  ]).catch(() => null);
  if (!content)
    return (
      <p role="alert">
        We couldn’t load your portfolio. Refresh to try preview again.
      </p>
    );
  const [data, projects] = content;
  const resume = data ? resolveAccountResume(data) : null;
  if (!resume)
    return (
      <p role="alert">
        We couldn’t load your resume. Refresh to try preview again.
      </p>
    );
  return (
    <section className="space-y-6">
      <div>
        <p className="eyebrow">Only visible to you</p>
        <h1 className="text-3xl font-bold">Preview your portfolio</h1>
      </div>
      <PublicationControls
        key={`${status.revision}-${status.is_published}`}
        initial={status}
      />
      {resume.profile.name.trim() ? (
        <ResumeDocument resume={resume} projects={projects.items} preview />
      ) : (
        <div className="rounded-xl border bg-card p-8">
          <h2 className="text-xl font-semibold">Your draft starts here</h2>
          <p className="mt-3">
            Add your introduction in{" "}
            <Link className="underline" href="/admin/resume">
              Resume
            </Link>
            , then return here to see your portfolio take shape.
          </p>
        </div>
      )}
    </section>
  );
}
