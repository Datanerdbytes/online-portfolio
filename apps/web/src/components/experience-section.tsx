import { resume } from "@/content/resume";
import { Badge } from "@/components/ui/badge";
import { formatExperiencePeriod } from "@/lib/resume";

export function ExperienceSection() {
  return (
    <section
      id="experience"
      aria-labelledby="experience-heading"
      className="portfolio-section"
    >
      <div className="content-width">
        <p className="eyebrow">The journey so far</p>
        <h2 id="experience-heading" className="section-heading">
          Experience
        </h2>
        {resume.experience.length === 0 ? (
          <p className="section-description">No experience entries defined.</p>
        ) : (
          <div className="experience-timeline">
            {resume.experience.map((job) => (
              <article key={job.id} className="timeline-entry">
                <div className="timeline-meta">
                  <p>{formatExperiencePeriod(job)}</p>
                  <span>{job.organization}</span>
                </div>
                <div className="timeline-content">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3>{job.role}</h3>
                    {job.isSample && <Badge variant="outline">Sample</Badge>}
                  </div>
                  {job.description && <p>{job.description}</p>}
                  {!!job.highlights?.length && (
                    <ul>
                      {job.highlights.map((highlight) => (
                        <li key={highlight}>{highlight}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
