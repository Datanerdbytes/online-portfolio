import { notFound } from "next/navigation";
import { getPublicResumeState } from "@/lib/resume-server";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintResumeButton } from "@/components/print-resume-button";
import { ResumeDocument } from "@/components/resume-document";
import { Button } from "@/components/ui/button";
import { fetchProjects } from "@/lib/api";
import { resolveAccountResume } from "@/lib/resume";

export const metadata: Metadata = {
  title: "Printable resume",
  description: "Published resume and selected projects.",
};

export default async function ResumePage() {
  const [apiResume, apiProjects] = await Promise.all([
    getPublicResumeState(),
    fetchProjects().catch(() => null),
  ]);
  if (apiResume.status === "missing") notFound();
  if (apiResume.status !== "ok")
    return (
      <p role="alert">This resume is temporarily unavailable. Please retry.</p>
    );
  const resume = resolveAccountResume(apiResume.data);
  if (!resume) notFound();
  if (!apiProjects)
    return (
      <p role="alert">Projects are temporarily unavailable. Please retry.</p>
    );
  const projects = apiProjects.items;

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
        </div>
      </div>

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
