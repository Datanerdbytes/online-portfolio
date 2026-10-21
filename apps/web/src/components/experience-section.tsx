import type { ApiExperience } from "@/lib/api";
import { formatExperiencePeriod } from "@/lib/resume";

type Props = {
  experience: ApiExperience[];
};

export function ExperienceSection({ experience }: Props) {
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
        {experience.length === 0 ? (
          <p className="section-description">No experience entries defined.</p>
        ) : (
          <div className="experience-timeline">
            {experience.map((job) => (
              <article key={job.id} className="timeline-entry">
                <div className="timeline-meta">
                  <p>{formatExperiencePeriod(job)}</p>
                  <span>{job.organization}</span>
                </div>
                <div className="timeline-content">
                  <h3>{job.role}</h3>
                  {job.description && <p>{job.description}</p>}
                  {job.highlights.length > 0 && (
                    <ul>
                      {job.highlights.map((h) => (
                        <li key={h.id}>{h.text}</li>
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
