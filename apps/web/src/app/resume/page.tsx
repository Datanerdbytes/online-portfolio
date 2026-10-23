import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { resume as staticResume } from "@/content/resume";
import { PrintResumeButton } from "@/components/print-resume-button";
import { ShareLinkButton } from "@/components/share-link-button";
import { ResumeDocument } from "@/components/resume-document";
import { Button } from "@/components/ui/button";
import { fetchProjectsSafe, fetchResume } from "@/lib/api";
import { resolveProjects, resolveResume } from "@/lib/resume";

export const metadata: Metadata = {
  title: `Resume | ${staticResume.profile.name}`,
  description: `Printable resume for ${staticResume.profile.name}: experience, selected projects, skills, and education.`,
};

export default async function ResumePage() {
  const [apiResume, apiProjects] = await Promise.all([
    fetchResume(),
    fetchProjectsSafe(),
  ]);
  const resume = resolveResume(apiResume);
  const projects = resolveProjects(apiProjects);

  return (
    <section className="resume-page" aria-labelledby="resume-page-heading">
      <div className="content-width resume-toolbar">
        <div>
          <h1 id="resume-page-heading" className="resume-toolbar-title">
            Online Resume
          </h1>
        </div>
        <div className="resume-toolbar-actions">
          <Button
            asChild
            variant="outline"
            className="h-11 px-2 text-xs sm:h-8"
          >
            <Link href="/#about">
              <ArrowLeft size={14} aria-hidden="true" />
              Back to portfolio
            </Link>
          </Button>
          <PrintResumeButton />
          <ShareLinkButton path="/resume" label="Share resume" compact />
        </div>
      </div>

      {resume.source === "static" && (
        <p className="content-width resume-notice" role="status">
          Live resume data is unavailable right now, so this document shows the
          copy stored in the repository. The layout and content are identical to
          what the API serves.
        </p>
      )}

      {resume.isSample && resume.sampleNotice && (
        <p className="content-width resume-notice" role="status">
          {resume.sampleNotice}
        </p>
      )}

      <div className="content-width resume-shell">
        <ResumeDocument resume={resume} projects={projects} />
      </div>
    </section>
  );
}
