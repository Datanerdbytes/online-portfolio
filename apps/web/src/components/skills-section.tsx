import type { ApiSkillGroup } from "@/lib/api";

type Props = {
  about: string;
  skills: ApiSkillGroup[];
  index?: string;
};

export function SkillsSection({ about, skills, index = "01" }: Props) {
  return (
    <section
      id="skills"
      aria-labelledby="skills-heading"
      className="portfolio-section"
    >
      <div className="content-width section-layout">
        <div className="section-intro">
          <p className="section-index">{index} — Skills &amp; tools</p>
          <h2 id="skills-heading" className="section-heading">
            Turning data into understanding
          </h2>
          <p className="section-description">{about}</p>
        </div>
        <div className="section-body">
          {skills.length === 0 ? (
            <p className="section-description">No skill groups defined.</p>
          ) : (
            <div className="skills-grid">
              {skills.map((group, groupIndex) => (
                <div className="skill-group" key={group.id}>
                  <h3>
                    <span className="skill-group-index" aria-hidden="true">
                      {String(groupIndex + 1).padStart(2, "0")}
                    </span>
                    {group.label}
                  </h3>
                  <ul className="skill-list">
                    {group.items.map((skill) => (
                      <li key={skill.id}>{skill.item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
