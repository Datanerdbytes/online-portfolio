import { GraduationCap } from "lucide-react";
import type { ApiEducation } from "@/lib/api";
import { formatEducationPeriod } from "@/lib/resume";

type Props = {
  education: ApiEducation[];
};

export function EducationSection({ education }: Props) {
  return (
    <section
      id="education"
      aria-labelledby="education-heading"
      className="portfolio-section section-tinted"
    >
      <div className="content-width">
        <p className="eyebrow">Foundations</p>
        <h2 id="education-heading" className="section-heading">
          Education
        </h2>
        {education.length === 0 ? (
          <p className="section-description">No education entries defined.</p>
        ) : (
          <div className="education-list">
            {education.map((entry) => (
              <article key={entry.id} className="education-entry">
                <span className="education-icon">
                  <GraduationCap size={25} aria-hidden="true" />
                </span>
                <div>
                  <h3>{entry.qualification}</h3>
                  <p>{entry.institution}</p>
                </div>
                <p className="education-period">
                  {formatEducationPeriod(entry)}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
