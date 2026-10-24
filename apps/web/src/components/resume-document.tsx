import {
  ExternalLink,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  Sparkles,
} from "lucide-react";
import type { Project } from "@/lib/api";
import { ProfileAvatar } from "@/components/profile-avatar";
import { profileImageUrl } from "@/lib/avatar";
import {
  formatEducationPeriod,
  formatExperiencePeriod,
  isAbsoluteHttpUrl,
  type ResolvedResume,
} from "@/lib/resume";

type Props = {
  resume: ResolvedResume;
  projects: Project[];
  preview?: boolean;
};

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

export function ResumeDocument({ resume, projects, preview = false }: Props) {
  const { profile, skills, experience, education, contact } = resume;
  const links = (contact.links ?? []).filter((link) =>
    isAbsoluteHttpUrl(link.url)
  );
  const publishedProjects = projects;
  const profileImage = profileImageUrl(
    profile.avatar_url,
    profile.avatar_updated_at
  );

  return (
    <article className="resume-paper" aria-label={`${profile.name} resume`}>
      <header className="resume-doc-header">
        <div className="resume-doc-identity">
          <p className="resume-doc-kicker">Resume</p>
          <h1 className="resume-doc-name">{profile.name}</h1>
          <p className="resume-doc-headline">{profile.headline}</p>
        </div>
        <ul className="resume-doc-contact">
          {contact.phone && (
            <li>
              <Phone size={15} aria-hidden="true" />
              <a href={telHref(contact.phone)}>{contact.phone}</a>
            </li>
          )}
          {contact.email && (
            <li>
              <Mail size={15} aria-hidden="true" />
              <a href={`mailto:${contact.email}`}>{contact.email}</a>
            </li>
          )}
          {profile.location && (
            <li>
              <MapPin size={15} aria-hidden="true" />
              <span>{profile.location}</span>
            </li>
          )}
          {links.map((link) => (
            <li key={link.url}>
              <ExternalLink size={15} aria-hidden="true" />
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </header>

      <section
        className="resume-doc-profile"
        aria-labelledby="resume-profile-heading"
      >
        <h2 id="resume-profile-heading" className="resume-doc-section-title">
          Career profile
        </h2>
        <div className="resume-doc-profile-body">
          <ProfileAvatar
            src={profileImage}
            name={profile.name}
            size="resume"
            className="resume-doc-avatar"
            lazy={false}
          />
          <div>
            <p className="resume-doc-intro">{profile.introduction}</p>
            <p className="resume-doc-about">{profile.about}</p>
          </div>
        </div>
      </section>

      <div className="resume-doc-columns">
        <div className="resume-doc-main">
          <section aria-labelledby="resume-experience-heading">
            <h2
              id="resume-experience-heading"
              className="resume-doc-section-title"
            >
              Experience
            </h2>
            {experience.length === 0 ? (
              <p className="resume-doc-empty">No experience entries defined.</p>
            ) : (
              <ol className="resume-doc-list">
                {experience.map((job) => (
                  <li key={job.id} className="resume-doc-entry">
                    <div className="resume-doc-entry-head">
                      <h3 className="resume-doc-entry-title">{job.role}</h3>
                      <p className="resume-doc-entry-meta">
                        <span className="resume-doc-entry-org">
                          {job.organization}
                        </span>
                        <span className="resume-doc-entry-period">
                          {formatExperiencePeriod(job)}
                        </span>
                      </p>
                    </div>
                    {job.description && (
                      <p className="resume-doc-entry-text">{job.description}</p>
                    )}
                    {job.highlights.length > 0 && (
                      <ul className="resume-doc-highlights">
                        {job.highlights.map((highlight) => (
                          <li key={highlight.id}>{highlight.text}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section
            className="resume-doc-projects"
            aria-labelledby="resume-projects-heading"
          >
            <h2
              id="resume-projects-heading"
              className="resume-doc-section-title"
            >
              Selected projects
            </h2>
            {publishedProjects.length === 0 ? (
              <p className="resume-doc-empty">No projects added yet.</p>
            ) : (
              <ul className="resume-doc-list">
                {publishedProjects.map((project) => (
                  <li key={project.id} className="resume-doc-entry">
                    <div className="resume-doc-entry-head">
                      <h3 className="resume-doc-entry-title">
                        {project.title}
                      </h3>
                      {project.is_sample && (
                        <span className="resume-doc-badge">Sample</span>
                      )}
                    </div>
                    <p className="resume-doc-entry-text">{project.summary}</p>
                    {project.technologies.length > 0 && (
                      <p className="resume-doc-tags">
                        {project.technologies.join(" · ")}
                      </p>
                    )}
                    {(isAbsoluteHttpUrl(project.repository_url) ||
                      isAbsoluteHttpUrl(project.demo_url)) && (
                      <p className="resume-doc-links">
                        {isAbsoluteHttpUrl(project.repository_url) && (
                          <a
                            href={project.repository_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Repository
                          </a>
                        )}
                        {isAbsoluteHttpUrl(project.demo_url) && (
                          <a
                            href={project.demo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Live demo
                          </a>
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="resume-doc-aside">
          <section aria-labelledby="resume-skills-heading">
            <h2 id="resume-skills-heading" className="resume-doc-section-title">
              Key skills
            </h2>
            {skills.length === 0 ? (
              <p className="resume-doc-empty">No skills defined.</p>
            ) : (
              <div className="resume-doc-skill-groups">
                {skills.map((group) => (
                  <div key={group.id} className="resume-doc-skill-group">
                    <h3>{group.label}</h3>
                    <ul>
                      {group.items.map((item) => (
                        <li key={item.id}>{item.item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="resume-education-heading">
            <h2
              id="resume-education-heading"
              className="resume-doc-section-title"
            >
              Education
            </h2>
            {education.length === 0 ? (
              <p className="resume-doc-empty">No education entries defined.</p>
            ) : (
              <div className="resume-doc-list">
                {education.map((entry) => (
                  <div key={entry.id} className="resume-doc-entry">
                    <div className="resume-doc-entry-head">
                      <h3 className="resume-doc-entry-title">
                        <GraduationCap
                          size={15}
                          aria-hidden="true"
                          className="resume-doc-entry-icon"
                        />
                        {entry.qualification}
                      </h3>
                    </div>
                    <p className="resume-doc-entry-meta">
                      <span className="resume-doc-entry-org">
                        {entry.institution}
                      </span>
                      <span className="resume-doc-entry-period">
                        {formatEducationPeriod(entry)}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section
            className="resume-doc-aside-note"
            aria-labelledby="resume-note-heading"
          >
            <h2 id="resume-note-heading" className="resume-doc-section-title">
              About this document
            </h2>
            <p className="resume-doc-note-text">
              <Sparkles size={14} aria-hidden="true" />
              {preview
                ? "This is your saved private draft. Publish when you’re ready to share these changes."
                : "This document shows the portfolio version its owner chose to share."}
            </p>
          </section>
        </aside>
      </div>

      <footer className="resume-doc-footer">
        <p>
          {profile.name} · {profile.headline}
        </p>
        {links.length > 0 && (
          <p className="resume-doc-footer-links">
            {links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
            ))}
          </p>
        )}
      </footer>
    </article>
  );
}
