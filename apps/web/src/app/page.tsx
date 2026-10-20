import { resume } from "@/content/resume";
import { Separator } from "@/components/ui/separator";
import { ContactSection } from "@/components/contact-section";
import { EducationSection } from "@/components/education-section";
import { ExperienceSection } from "@/components/experience-section";
import { ProjectsClient } from "@/components/projects";
import { SkillsSection } from "@/components/skills-section";

export default function Home() {
  return (
    <div className="flex min-w-0 flex-col flex-1 [overflow-wrap:anywhere]">
      <section id="intro" className="py-12 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            {resume.isSample && resume.sampleNotice && (
              <p className="text-sm font-semibold text-primary uppercase tracking-wider">
                {resume.sampleNotice}
              </p>
            )}
            <h1 className="mt-2 text-4xl sm:text-5xl font-bold tracking-tight">
              {resume.profile.name}
            </h1>
            {resume.profile.headline && (
              <p className="mt-2 text-lg text-muted-foreground">
                {resume.profile.headline}
              </p>
            )}
            <p className="mt-6 text-lg text-muted-foreground">
              {resume.profile.introduction}
            </p>
          </div>
        </div>
      </section>

      <Separator />

      <section id="about" className="py-12 sm:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            About
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {resume.profile.about}
          </p>
          {resume.profile.location && (
            <p className="mt-2 text-lg text-muted-foreground">
              {resume.profile.location}
            </p>
          )}
        </div>
      </section>

      <Separator />

      <SkillsSection />

      <Separator />

      <section id="projects" className="py-12 sm:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Selected projects
          </h2>
          <ProjectsClient />
        </div>
      </section>

      <Separator />

      <ExperienceSection />

      <Separator />

      <EducationSection />

      <Separator />

      <ContactSection />
    </div>
  );
}
