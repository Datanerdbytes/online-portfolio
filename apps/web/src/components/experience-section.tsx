import { resume } from "@/content/resume";
import { Badge } from "@/components/ui/badge";
import { formatExperiencePeriod } from "@/lib/resume";

export function ExperienceSection() {
  return (
    <section
      id="experience"
      aria-labelledby="experience-heading"
      className="py-12 sm:py-24 bg-muted/30"
    >
      <div className="container mx-auto px-4">
        <h2 id="experience-heading" className="text-2xl sm:text-3xl font-bold tracking-tight">
          Experience
        </h2>
        {resume.experience.length === 0 ? (
          <p className="mt-8 text-lg text-muted-foreground">
            No experience entries defined.
          </p>
        ) : (
          <div className="mt-8 space-y-6">
            {resume.experience.map((job) => {
              const period = formatExperiencePeriod(job);
              const highlights = job.highlights ?? [];
              return (
                <div
                  key={job.id}
                  className="grid min-w-0 gap-4 [overflow-wrap:anywhere] lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{job.role}</h3>
                      {job.isSample && (
                        <Badge variant="outline" className="shrink-0 text-xs">Sample</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {job.organization}
                      {period ? ` · ${period}` : ""}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">
                      {job.description}
                    </p>
                    {highlights.length > 0 && (
                      <ul
                        className="mt-2 text-sm text-muted-foreground list-disc list-inside space-y-1"
                        aria-label={`${job.role} highlights`}
                      >
                        {highlights.map((highlight) => (
                          <li key={highlight}>{highlight}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
