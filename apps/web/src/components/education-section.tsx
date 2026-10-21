import { GraduationCap } from "lucide-react";
import { resume } from "@/content/resume";
import { Badge } from "@/components/ui/badge";
import { formatEducationPeriod } from "@/lib/resume";

export function EducationSection() {
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
        {resume.education.length === 0 ? (
          <p className="section-description">No education entries defined.</p>
        ) : (
          <div className="education-list">
            {resume.education.map((entry) => (
              <article key={entry.id} className="education-entry">
                <span className="education-icon">
                  <GraduationCap size={25} aria-hidden="true" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3>{entry.qualification}</h3>
                    {entry.isSample && <Badge variant="outline">Sample</Badge>}
                  </div>
                  <p>{entry.institution}</p>
                  {!!entry.details?.length && (
                    <ul>
                      {entry.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  )}
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
