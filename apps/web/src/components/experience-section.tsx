import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ApiExperience } from "@/lib/api";
import { formatExperiencePeriod } from "@/lib/resume";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  experience: ApiExperience[];
  index?: string;
  status?: "ready" | "loading" | "unavailable";
  pageHref?: string;
};

export function ExperienceSection({
  experience,
  index = "03",
  status = "ready",
  pageHref,
}: Props) {
  return (
    <section
      id="experience"
      aria-labelledby="experience-heading"
      className="portfolio-section"
    >
      <div className="content-width section-layout">
        <div className="section-intro">
          <p className="section-index">{index} — Experience</p>
          <h2 id="experience-heading" className="section-heading">
            Experience
          </h2>
          <p className="section-description">
            The roles and responsibilities behind this portfolio.
          </p>
          {pageHref && (
            <Link href={pageHref} className="section-page-link">
              Open experience page
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          )}
        </div>
        <div className="section-body">
          {status === "loading" ? (
            <div className="job-list" aria-busy="true">
              {[0, 1].map((job) => (
                <article className="job-entry" key={job} aria-hidden="true">
                  <div>
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-2 h-3 w-20" />
                  </div>
                  <div>
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="mt-3 h-4 w-full" />
                    <Skeleton className="mt-2 h-4 w-5/6" />
                  </div>
                </article>
              ))}
            </div>
          ) : status === "unavailable" ? (
            <p className="section-description" role="alert">
              Experience is temporarily unavailable.
            </p>
          ) : experience.length === 0 ? (
            <p className="section-description">
              No experience entries defined.
            </p>
          ) : (
            <div className="job-list">
              {experience.map((job) => (
                <article key={job.id} className="job-entry">
                  <div>
                    <p className="job-period">{formatExperiencePeriod(job)}</p>
                    <p className="job-organization">{job.organization}</p>
                  </div>
                  <div>
                    <h3 className="job-role">{job.role}</h3>
                    {job.description && (
                      <p className="job-description">{job.description}</p>
                    )}
                    {job.highlights.length > 0 && (
                      <ul className="job-highlights">
                        {job.highlights.map((highlight) => (
                          <li key={highlight.id}>{highlight.text}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
