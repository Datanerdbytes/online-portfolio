import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ApiEducation } from "@/lib/api";
import { formatEducationPeriod } from "@/lib/resume";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  education: ApiEducation[];
  index?: string;
  status?: "ready" | "loading" | "unavailable";
  pageHref?: string;
};

export function EducationSection({
  education,
  index = "04",
  status = "ready",
  pageHref,
}: Props) {
  return (
    <section
      id="education"
      aria-labelledby="education-heading"
      className="portfolio-section section-tinted"
    >
      <div className="content-width section-layout">
        <div className="section-intro">
          <p className="section-index">{index} — Education</p>
          <h2 id="education-heading" className="section-heading">
            Education
          </h2>
          <p className="section-description">
            The academic foundation behind the work.
          </p>
          {pageHref && (
            <Link href={pageHref} className="section-page-link">
              Open education page
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          )}
        </div>
        <div className="section-body">
          {status === "loading" ? (
            <div className="education-list" aria-busy="true">
              {[0, 1].map((entry) => (
                <article
                  className="education-entry"
                  key={entry}
                  aria-hidden="true"
                >
                  <div>
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="mt-2 h-3 w-32" />
                  </div>
                  <Skeleton className="h-3 w-24" />
                </article>
              ))}
            </div>
          ) : status === "unavailable" ? (
            <p className="section-description" role="alert">
              Education is temporarily unavailable.
            </p>
          ) : education.length === 0 ? (
            <p className="section-description">No education entries defined.</p>
          ) : (
            <div className="education-list">
              {education.map((entry) => (
                <article key={entry.id} className="education-entry">
                  <div>
                    <h3>{entry.qualification}</h3>
                    <p className="education-school">{entry.institution}</p>
                  </div>
                  <p className="education-period">
                    {formatEducationPeriod(entry)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
