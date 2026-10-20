import { resume } from "@/content/resume";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ProjectsClient } from "@/components/projects";

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <section id="intro" className="py-12 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider">
              {resume.label}
            </p>
            <h1 className="mt-2 text-4xl sm:text-5xl font-bold tracking-tight">
              Online Resume &amp; Portfolio
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              {resume.intro}
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
          <p className="mt-4 text-lg text-muted-foreground">{resume.about}</p>
        </div>
      </section>

      <Separator />

      <section id="skills" className="py-12 sm:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Skills
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {resume.skills.map((skillArea) => (
              <Card key={skillArea.label}>
                <CardHeader>
                  <CardTitle>{skillArea.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {skillArea.items.map((skill) => (
                    <div key={skill} className="flex items-center gap-2">
                      <Badge variant="outline">{skill}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

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

      <section id="experience" className="py-12 sm:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Experience
          </h2>
          <div className="mt-8 space-y-6">
            {resume.experience.flatMap((group) =>
              group.items.map((job) => (
                <div key={job.role} className="flex flex-col gap-2 sm:flex-row sm:items-baseline">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold">{job.role}</h3>
                    <p className="text-sm text-muted-foreground">
                      {job.organization} &middot; {job.period}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">{job.summary}</p>
                </div>
              )),
            )}
          </div>
        </div>
      </section>

      <Separator />

      <section id="contact" className="py-12 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-lg">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Contact
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              {resume.contact.note}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
