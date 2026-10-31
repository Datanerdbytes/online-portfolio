import type { ApiExperience } from "@/lib/api";
import { formatExperiencePeriod } from "@/lib/resume";

type Props = {
  experience: ApiExperience[];
  index?: string;
};

export function ExperienceSection({ experience, index = "03" }: Props) {
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
        </div>
        <div className="section-body">
          {experience.length === 0 ? (
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
