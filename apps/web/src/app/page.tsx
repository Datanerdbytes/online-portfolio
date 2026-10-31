import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  getAboutState,
  getContactState,
  getEducationState,
  getExperienceState,
  getSkillsState,
} from "@/lib/resume-server";
import { ContactSection } from "@/components/contact-section";
import { EducationSection } from "@/components/education-section";
import { ExperienceSection } from "@/components/experience-section";
import { HealthStatus } from "@/components/health-status";
import { ProfileHero } from "@/components/profile-hero";
import { ProjectsClient } from "@/components/projects";
import { ProjectsSection } from "@/components/projects-section";
import { SkillsSection } from "@/components/skills-section";

export async function generateMetadata(): Promise<Metadata> {
  const about = await getAboutState(null);
  return about.status === "ok"
    ? {
        title: `${about.data.name} | Resume & Portfolio`,
        description: about.data.headline,
      }
    : { title: "Resume & Portfolio" };
}

async function SkillsRegion({ about }: { about: string }) {
  const skills = await getSkillsState(null);
  return (
    <SkillsSection
      about={about}
      skills={skills.status === "ok" ? skills.data : []}
      status={skills.status === "ok" ? "ready" : "unavailable"}
      index="01"
      pageHref="/skills"
    />
  );
}

async function ExperienceRegion() {
  const experience = await getExperienceState(null);
  return (
    <ExperienceSection
      experience={experience.status === "ok" ? experience.data : []}
      status={experience.status === "ok" ? "ready" : "unavailable"}
      index="03"
      pageHref="/experience"
    />
  );
}

async function EducationRegion() {
  const education = await getEducationState(null);
  return (
    <EducationSection
      education={education.status === "ok" ? education.data : []}
      status={education.status === "ok" ? "ready" : "unavailable"}
      index="04"
      pageHref="/education"
    />
  );
}

export default async function Home() {
  const [about, contact] = await Promise.all([
    getAboutState(null),
    getContactState(null),
  ]);
  if (about.status === "missing") notFound();
  if (about.status !== "ok")
    return (
      <p className="content-width py-16" role="alert">
        This portfolio is temporarily unavailable. Please try again in a moment.
      </p>
    );
  const profile = about.data;
  const contactData = contact.status === "ok" ? contact.data : null;

  return (
    <>
      <ProfileHero
        profile={profile}
        email={contactData?.email ?? null}
        projectsHref="#projects"
        resumeHref="/resume"
      />

      <Suspense
        fallback={
          <SkillsSection
            about={profile.about}
            skills={[]}
            status="loading"
            index="01"
            pageHref="/skills"
          />
        }
      >
        <SkillsRegion about={profile.about} />
      </Suspense>

      <ProjectsSection pageHref="/projects">
        <ProjectsClient />
      </ProjectsSection>

      <Suspense
        fallback={
          <ExperienceSection
            experience={[]}
            status="loading"
            index="03"
            pageHref="/experience"
          />
        }
      >
        <ExperienceRegion />
      </Suspense>
      <Suspense
        fallback={
          <EducationSection
            education={[]}
            status="loading"
            index="04"
            pageHref="/education"
          />
        }
      >
        <EducationRegion />
      </Suspense>
      <ContactSection
        contact={contactData}
        status={contact.status === "unavailable" ? "unavailable" : "ready"}
        pageHref="/contact"
      />

      <div className="content-width system-status">
        <span>Behind this portfolio</span>
        <HealthStatus />
      </div>
    </>
  );
}
