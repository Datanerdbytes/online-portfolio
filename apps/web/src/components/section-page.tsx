import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { ContactSection } from "@/components/contact-section";
import { EducationSection } from "@/components/education-section";
import { ExperienceSection } from "@/components/experience-section";
import { ProfileHero } from "@/components/profile-hero";
import { ProjectCard } from "@/components/project-cards";
import { ProjectsSection } from "@/components/projects-section";
import { SkillsSection } from "@/components/skills-section";
import {
  getAboutState,
  getContactState,
  getEducationState,
  getExperienceState,
  getProjectsState,
  getSkillsState,
} from "@/lib/resume-server";

export const SECTION_IDS = [
  "about",
  "skills",
  "projects",
  "experience",
  "education",
  "contact",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

const SECTION_LABELS: Record<SectionId, string> = {
  about: "About",
  skills: "Skills",
  projects: "Projects",
  experience: "Experience",
  education: "Education",
  contact: "Contact",
};

export function isSectionId(value: string): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value);
}

function homeHref(ownerId: string | null): string {
  return ownerId ? `/u/${encodeURIComponent(ownerId)}` : "/";
}

function sectionHref(ownerId: string | null, section: SectionId): string {
  return ownerId
    ? `/u/${encodeURIComponent(ownerId)}/${section}`
    : `/${section}`;
}

function SectionPageFrame({
  ownerId,
  current,
  children,
}: {
  ownerId: string | null;
  current: SectionId;
  children: ReactNode;
}) {
  return (
    <div className="section-page">
      <div className="content-width section-page-back-row">
        <Link href={homeHref(ownerId)} className="section-page-back">
          <ArrowLeft size={13} aria-hidden="true" />
          {ownerId ? "Shared portfolio" : "Portfolio home"}
        </Link>
      </div>
      {current !== "about" && (
        <h1 className="sr-only">{SECTION_LABELS[current]}</h1>
      )}
      {children}
    </div>
  );
}

function SectionUnavailable({
  ownerId,
  current,
}: {
  ownerId: string | null;
  current: SectionId;
}) {
  return (
    <SectionPageFrame ownerId={ownerId} current={current}>
      <div className="content-width">
        <p role="alert" className="resume-notice">
          {SECTION_LABELS[current]} is temporarily unavailable. Please try again
          in a moment.
        </p>
      </div>
    </SectionPageFrame>
  );
}

export async function sectionPageMetadata(
  section: SectionId,
  ownerId: string | null
): Promise<Metadata> {
  const about = await getAboutState(ownerId);
  const label = SECTION_LABELS[section];
  return about.status === "ok"
    ? {
        title: `${label} | ${about.data.name}`,
        description: about.data.headline,
      }
    : { title: label };
}

async function AboutPage({ ownerId }: { ownerId: string | null }) {
  const [about, contact] = await Promise.all([
    getAboutState(ownerId),
    getContactState(ownerId),
  ]);
  if (about.status === "missing") notFound();
  if (about.status !== "ok")
    return <SectionUnavailable ownerId={ownerId} current="about" />;

  return (
    <SectionPageFrame ownerId={ownerId} current="about">
      <ProfileHero
        profile={about.data}
        email={contact.status === "ok" ? contact.data.email : null}
        projectsHref={sectionHref(ownerId, "projects")}
        resumeHref={ownerId ? homeHref(ownerId) : "/resume"}
      />
      {about.data.about && (
        <div className="content-width about-body">
          <p>{about.data.about}</p>
        </div>
      )}
    </SectionPageFrame>
  );
}

async function SkillsPage({ ownerId }: { ownerId: string | null }) {
  const [about, skills] = await Promise.all([
    getAboutState(ownerId),
    getSkillsState(ownerId),
  ]);
  if (about.status === "missing" || skills.status === "missing") notFound();
  if (skills.status !== "ok")
    return <SectionUnavailable ownerId={ownerId} current="skills" />;

  return (
    <SectionPageFrame ownerId={ownerId} current="skills">
      <SkillsSection
        about={about.status === "ok" ? about.data.about : ""}
        skills={skills.data}
      />
    </SectionPageFrame>
  );
}

async function ProjectsPage({ ownerId }: { ownerId: string | null }) {
  const projects = await getProjectsState(ownerId);
  if (projects.status === "missing") notFound();

  return (
    <SectionPageFrame ownerId={ownerId} current="projects">
      <ProjectsSection>
        {projects.status !== "ok" ? (
          <p className="section-description" role="alert">
            Projects are temporarily unavailable. Please try again in a moment.
          </p>
        ) : projects.data.length === 0 ? (
          <p className="section-description">
            There are no published projects to show yet.
          </p>
        ) : (
          <div className="project-grid">
            {projects.data.map((project, index) => (
              <ProjectCard
                key={project.id}
                project={project}
                index={index}
                detailHref={ownerId ? null : undefined}
              />
            ))}
          </div>
        )}
      </ProjectsSection>
    </SectionPageFrame>
  );
}

async function ExperiencePage({ ownerId }: { ownerId: string | null }) {
  const experience = await getExperienceState(ownerId);
  if (experience.status === "missing") notFound();

  return (
    <SectionPageFrame ownerId={ownerId} current="experience">
      <ExperienceSection
        experience={experience.status === "ok" ? experience.data : []}
        status={experience.status === "ok" ? "ready" : "unavailable"}
      />
    </SectionPageFrame>
  );
}

async function EducationPage({ ownerId }: { ownerId: string | null }) {
  const education = await getEducationState(ownerId);
  if (education.status === "missing") notFound();

  return (
    <SectionPageFrame ownerId={ownerId} current="education">
      <EducationSection
        education={education.status === "ok" ? education.data : []}
        status={education.status === "ok" ? "ready" : "unavailable"}
      />
    </SectionPageFrame>
  );
}

async function ContactPage({ ownerId }: { ownerId: string | null }) {
  const contact = await getContactState(ownerId);
  if (contact.status === "missing") notFound();

  return (
    <SectionPageFrame ownerId={ownerId} current="contact">
      <ContactSection
        contact={contact.status === "ok" ? contact.data : null}
        status={contact.status === "ok" ? "ready" : "unavailable"}
      />
    </SectionPageFrame>
  );
}

export function PublicSectionPage({
  section,
  ownerId,
}: {
  section: SectionId;
  ownerId: string | null;
}) {
  switch (section) {
    case "about":
      return <AboutPage ownerId={ownerId} />;
    case "skills":
      return <SkillsPage ownerId={ownerId} />;
    case "projects":
      return <ProjectsPage ownerId={ownerId} />;
    case "experience":
      return <ExperiencePage ownerId={ownerId} />;
    case "education":
      return <EducationPage ownerId={ownerId} />;
    case "contact":
      return <ContactPage ownerId={ownerId} />;
  }
}
