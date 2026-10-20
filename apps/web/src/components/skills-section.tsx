import { resume } from "@/content/resume";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SkillsSection() {
  return (
    <section id="skills" aria-labelledby="skills-heading" className="py-12 sm:py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <h2 id="skills-heading" className="text-2xl sm:text-3xl font-bold tracking-tight">
          Skills
        </h2>
        {resume.skills.length === 0 ? (
          <p className="mt-8 text-lg text-muted-foreground">
            No skill groups defined.
          </p>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {resume.skills.map((group) => (
              <Card key={group.label} className="min-w-0">
                <CardHeader>
                  <CardTitle className="[overflow-wrap:anywhere]">{group.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {group.items.map((skill) => (
                    <div key={skill} className="flex min-w-0 items-center gap-2">
                      <Badge variant="outline" className="min-w-0 max-w-full">
                        <span className="min-w-0 [overflow-wrap:anywhere]">{skill}</span>
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
