import { Database, CodeXml, ChartNoAxesCombined, Workflow } from "lucide-react";
import { resume } from "@/content/resume";

const icons = [Database, CodeXml, ChartNoAxesCombined, Workflow];

export function SkillsSection() {
  return (
    <section
      id="skills"
      aria-labelledby="skills-heading"
      className="portfolio-section"
    >
      <div className="content-width">
        <p className="eyebrow">A little about what I do</p>
        <h2 id="skills-heading" className="section-heading">
          Turning data into understanding
        </h2>
        <p className="section-description">{resume.profile.about}</p>
        {resume.skills.length === 0 ? (
          <p className="section-description">No skill groups defined.</p>
        ) : (
          <div className="skills-grid">
            {resume.skills.map((group, index) => {
              const Icon = icons[index % icons.length];
              return (
                <div key={group.label} className="skill-group">
                  <span
                    className={`skill-icon skill-color-${index % icons.length}`}
                  >
                    <Icon size={27} strokeWidth={1.7} aria-hidden="true" />
                  </span>
                  <h3>{group.label}</h3>
                  <ul>
                    {group.items.map((skill) => (
                      <li key={skill}>{skill}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
