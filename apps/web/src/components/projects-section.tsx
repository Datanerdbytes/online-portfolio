import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

export function ProjectsSection({
  children,
  pageHref,
}: {
  children: ReactNode;
  pageHref?: string;
}) {
  return (
    <section
      id="projects"
      aria-labelledby="projects-heading"
      className="portfolio-section section-tinted"
    >
      <div className="content-width section-layout">
        <div className="section-intro">
          <p className="section-index">02 — Selected work</p>
          <h2 id="projects-heading" className="section-heading">
            Projects
          </h2>
          <p className="section-description">
            A closer look at the pipelines, dashboards, and platforms behind the
            work.
          </p>
          {pageHref && (
            <Link href={pageHref} className="section-page-link">
              Open projects page
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          )}
        </div>
        <div className="section-body">{children}</div>
      </div>
    </section>
  );
}
