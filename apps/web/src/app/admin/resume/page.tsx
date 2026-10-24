import Link from "next/link";
import { workspaceSession } from "@/lib/workspace";
import { fetchResume } from "@/lib/api";
import { ResumeManager } from "@/components/resume-manager";
import { ProjectsQueryProvider } from "@/components/projects-query-provider";

export default async function AdminResumePage() {
  const session = await workspaceSession();
  if (!session) return null;
  const resume = await fetchResume(session.token);
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Resume</h1>
        <p className="mt-2 text-muted-foreground">
          Tell your story. Save your draft here, then preview and publish when
          ready.
        </p>
      </div>
      <p>
        <Link className="underline underline-offset-4" href="/admin/import">
          Import resume
        </Link>
      </p>
      {resume ? (
        <ProjectsQueryProvider>
          <ResumeManager
            profile={resume.profile}
            skills={resume.skills}
            experience={resume.experience}
            education={resume.education}
            contact={resume.contact}
          />
        </ProjectsQueryProvider>
      ) : (
        <p role="alert">
          We couldn’t load your resume. Your saved work is unchanged. Refresh to
          try again.
        </p>
      )}
    </section>
  );
}
