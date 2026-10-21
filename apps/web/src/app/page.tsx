import {
  ArrowDown,
  ArrowRight,
  Database,
  Layers3,
  MapPin,
  ChartNoAxesCombined,
} from "lucide-react";
import { resume } from "@/content/resume";
import { Button } from "@/components/ui/button";
import { ContactSection } from "@/components/contact-section";
import { EducationSection } from "@/components/education-section";
import { ExperienceSection } from "@/components/experience-section";
import { HealthStatus } from "@/components/health-status";
import { ProjectsClient } from "@/components/projects";
import { SkillsSection } from "@/components/skills-section";

export default function Home() {
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
            {resume.isSample && (
              <p className="sample-notice">
                {resume.sampleNotice ?? "Placeholder resume content"}
              </p>
            )}
            <h1 id="intro-heading">
              {resume.profile.name}
              <span className="text-primary">.</span>
            </h1>
            <p className="hero-headline">{resume.profile.headline}</p>
            <p className="hero-description">{resume.profile.introduction}</p>
            <div className="hero-actions">
              <Button asChild size="lg">
                <a href="#projects">
                  <ArrowRight size={17} aria-hidden="true" />
                  View portfolio
                </a>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="#experience">
                  <ArrowDown size={17} aria-hidden="true" />
                  My experience
                </a>
              </Button>
            </div>
            {resume.profile.location && (
              <p className="hero-location">
                <MapPin size={15} aria-hidden="true" />
                {resume.profile.location}
              </p>
            )}
          </div>
          <div
            className="data-illustration"
            role="img"
            aria-label="Illustration of a data workflow: raw data, transformation, and actionable insights."
          >
            <div className="illustration-top">
              <span className="illustration-mark">DATA / WORKFLOW</span>
              <span className="illustration-dots">
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className="workflow-step">
              <span className="workflow-icon">
                <Database size={24} />
              </span>
              <div>
                <small>01 / INGEST</small>
                <strong>Raw data</strong>
              </div>
              <span className="workflow-format">CSV · SQL · API</span>
            </div>
            <div className="workflow-connector">
              <span />
              <span>clean · test · model</span>
            </div>
            <div className="workflow-step">
              <span className="workflow-icon">
                <Layers3 size={24} />
              </span>
              <div>
                <small>02 / TRANSFORM</small>
                <strong>Trusted models</strong>
              </div>
              <span className="workflow-format">dbt · Python</span>
            </div>
            <div className="workflow-connector">
              <span />
              <span>explore · visualize</span>
            </div>
            <div className="workflow-step workflow-final">
              <span className="workflow-icon">
                <ChartNoAxesCombined size={24} />
              </span>
              <div>
                <small>03 / UNDERSTAND</small>
                <strong>Actionable insights</strong>
              </div>
              <div className="mini-bars">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="illustration-caption">
              <span>From source to story.</span>
              <ArrowDown size={16} />
            </div>
          </div>
        </div>
      </section>
      <SkillsSection />
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
      <ExperienceSection />
      <EducationSection />
      <ContactSection />
      <div className="content-width system-status">
        <span>Behind this portfolio</span>
        <HealthStatus />
      </div>
    </>
  );
}
