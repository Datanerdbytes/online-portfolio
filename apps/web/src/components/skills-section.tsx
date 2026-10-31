import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ApiSkillGroup } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  about: string;
  skills: ApiSkillGroup[];
  index?: string;
  status?: "ready" | "loading" | "unavailable";
  pageHref?: string;
};

export function SkillsSection({
  about,
  skills,
  index = "01",
  status = "ready",
  pageHref,
}: Props) {
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
          {pageHref && (
            <Link href={pageHref} className="section-page-link">
              Open skills page
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          )}
        </div>
        <div className="section-body">
          {status === "loading" ? (
            <div className="skills-grid" aria-busy="true">
              {[0, 1, 2].map((group) => (
                <div className="skill-group" key={group} aria-hidden="true">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="mt-4 h-3 w-full" />
                  <Skeleton className="mt-2 h-3 w-5/6" />
                  <Skeleton className="mt-2 h-3 w-2/3" />
                </div>
              ))}
            </div>
          ) : status === "unavailable" ? (
            <p className="section-description" role="alert">
              Skills are temporarily unavailable.
            </p>
          ) : skills.length === 0 ? (
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
