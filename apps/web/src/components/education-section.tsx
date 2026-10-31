import type { ApiEducation } from "@/lib/api";
import { formatEducationPeriod } from "@/lib/resume";

type Props = {
  education: ApiEducation[];
  index?: string;
};

export function EducationSection({ education, index = "04" }: Props) {
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
        </div>
        <div className="section-body">
          {education.length === 0 ? (
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
