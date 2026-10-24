import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { getPublicResumeState } from "@/lib/resume-server";
import { resolveAccountResume } from "@/lib/resume";
import { Button } from "@/components/ui/button";
import { ContactSection } from "@/components/contact-section";
import { EducationSection } from "@/components/education-section";
import { ExperienceSection } from "@/components/experience-section";
import { HealthStatus } from "@/components/health-status";
import { ShareLinkButton } from "@/components/share-link-button";
import { ProjectsClient } from "@/components/projects";
import { SkillsSection } from "@/components/skills-section";
import { profileImageUrl, BANNER_PATH } from "@/lib/avatar";

export async function generateMetadata(): Promise<Metadata> {
  const state = await getPublicResumeState();
  return state.status === "ok" && state.data.profile
    ? {
        title: `${state.data.profile.name} | Resume & Portfolio`,
        description: state.data.profile.headline,
      }
    : { title: "Resume & Portfolio" };
}

export default async function Home() {
  const state = await getPublicResumeState();
  if (state.status === "missing") notFound();
  if (state.status !== "ok")
    return (
      <p className="content-width py-12" role="alert">
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

  return (
    <>
      <section
        id="about"
        aria-labelledby="intro-heading"
        className="hero-section"
      >
        <div className="content-width hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Hello, welcome to my portfolio</p>
            <h1 id="intro-heading">{profile.name}</h1>
            <p className="hero-headline">{profile.headline}</p>
            <p className="hero-description">{profile.introduction}</p>
            <div className="hero-actions">
              <Button asChild size="lg">
                <a href="#projects">View portfolio</a>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/resume">
                  <FileText size={17} aria-hidden="true" />
                  View Resume
                </Link>
              </Button>
              <ShareLinkButton path="/" />
            </div>
            {profile.location && (
              <p className="hero-location">
                <MapPin size={15} aria-hidden="true" />
                {profile.location}
              </p>
            )}
          </div>
          <div className="hero-visual">
            <div className="hero-banner">
              {bannerSrc ? (
                <Image
                  src={bannerSrc}
                  alt={`${profile.name} hero banner`}
                  width={1200}
                  height={1200}
                  priority
                  sizes="(max-width: 639px) calc(100vw - 40px), (max-width: 1199px) 38vw, 420px"
                  className="hero-banner-image"
                  unoptimized
                />
              ) : (
                <div className="hero-banner-placeholder">
                  Add a banner photo from the profile settings.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      <SkillsSection about={profile.about} skills={skills} />
      <section
        id="projects"
        aria-labelledby="projects-heading"
        className="portfolio-section section-tinted"
      >
        <div className="content-width">
          <p className="eyebrow">Selected work</p>
          <h2 id="projects-heading" className="section-heading">
            Featured projects
          </h2>
          <p className="section-description">
            A closer look at the projects, tools, and ideas behind my work.
          </p>
          <ProjectsClient />
        </div>
      </section>
      <ExperienceSection experience={experience} />
      <EducationSection education={education} />
      <ContactSection contact={contact} />
      <div className="content-width system-status">
        <span>Behind this portfolio</span>
        <HealthStatus />
      </div>
    </>
  );
}
