import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowDownRight, FileText } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { getPublicResumeState } from "@/lib/resume-server";
import { resolveAccountResume } from "@/lib/resume";
import { Button } from "@/components/ui/button";
import { ContactSection } from "@/components/contact-section";
import { EducationSection } from "@/components/education-section";
import { ExperienceSection } from "@/components/experience-section";
import { HealthStatus } from "@/components/health-status";
import { ProjectsClient } from "@/components/projects";
import { SkillsSection } from "@/components/skills-section";
import { profileImageUrl, BANNER_PATH, initialsFromName } from "@/lib/avatar";

export async function generateMetadata(): Promise<Metadata> {
  const state = await getPublicResumeState();
  return state.status === "ok" && state.data.profile
    ? {
        title: `${state.data.profile.name} | Resume & Portfolio`,
        description: state.data.profile.headline,
      }
    : { title: "Resume & Portfolio" };
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return { first: name, last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts.at(-1) ?? "" };
}

export default async function Home() {
  const state = await getPublicResumeState();
  if (state.status === "missing") notFound();
  if (state.status !== "ok")
    return (
      <p className="content-width py-16" role="alert">
        This portfolio is temporarily unavailable. Please try again in a moment.
      </p>
    );
  const data = resolveAccountResume(state.data);
  if (!data) notFound();
  const { profile, skills, experience, education, contact } = data;
  const bannerSrc = profileImageUrl(
    profile.banner_url,
    profile.banner_updated_at,
    BANNER_PATH
  );
  const avatarSrc = profileImageUrl(
    profile.avatar_url,
    profile.avatar_updated_at
  );
  const portraitSrc = bannerSrc ?? avatarSrc;
  const { first, last } = splitName(profile.name);
  const year = new Date().getFullYear();

  return (
    <>
      <section id="about" aria-labelledby="intro-heading" className="hero">
        <div className="content-width hero-grid">
          <div className="hero-copy">
            <p className="hero-kicker">Resume &amp; portfolio</p>
            <h1 id="intro-heading" className="hero-name">
              {first}
              {last && (
                <>
                  {" "}
                  <em>{last}</em>
                </>
              )}
            </h1>
            <p className="hero-headline">{profile.headline}</p>
            <p className="hero-description">{profile.introduction}</p>
            <div className="hero-actions">
              <Button asChild size="lg" className="hero-button">
                <a href="#projects">
                  Explore selected work
                  <ArrowDownRight size={16} aria-hidden="true" />
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="hero-button"
              >
                <Link href="/resume">
                  <FileText size={15} aria-hidden="true" />
                  Read resume
                </Link>
              </Button>
            </div>
            {(profile.location || contact.email) && (
              <div className="hero-facts">
                {profile.location && (
                  <div className="hero-fact">
                    <span className="hero-fact-label">Based in</span>
                    <span className="hero-fact-value">{profile.location}</span>
                  </div>
                )}
                {contact.email && (
                  <div className="hero-fact">
                    <span className="hero-fact-label">Email</span>
                    <a
                      className="hero-fact-value"
                      href={`mailto:${contact.email}`}
                    >
                      {contact.email}
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="hero-visual">
            <div className="portrait-wrap">
              <div className="portrait-frame">
                {portraitSrc ? (
                  <Image
                    src={portraitSrc}
                    alt={`${profile.name} portrait`}
                    width={1200}
                    height={1500}
                    priority
                    sizes="(max-width: 1023px) 400px, 440px"
                    className="portrait-image"
                    unoptimized
                  />
                ) : (
                  <div className="portrait-fallback">
                    <span className="portrait-monogram">
                      {initialsFromName(profile.name)}
                    </span>
                    <span className="portrait-fallback-caption">
                      <span>Portrait</span>
                      <span>Add one in the editor</span>
                    </span>
                  </div>
                )}
              </div>
              <span className="portrait-chip">Portfolio · {year}</span>
            </div>
            <div className="portrait-meta">
              <span>{profile.name}</span>
              <span>{profile.location ?? "Resume & portfolio"}</span>
            </div>
          </div>
        </div>
      </section>

      <SkillsSection about={profile.about} skills={skills} index="01" />

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
              A closer look at the pipelines, dashboards, and platforms behind
              the work.
            </p>
          </div>
          <div className="section-body">
            <ProjectsClient />
          </div>
        </div>
      </section>

      <ExperienceSection experience={experience} index="03" />
      <EducationSection education={education} index="04" />
      <ContactSection contact={contact} />

      <div className="content-width system-status">
        <span>Behind this portfolio</span>
        <HealthStatus />
      </div>
    </>
  );
}
