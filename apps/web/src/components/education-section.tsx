import { resume } from "@/content/resume";
import { Badge } from "@/components/ui/badge";
import { formatEducationPeriod } from "@/lib/resume";

export function EducationSection() {
  return (
    <section
      id="education"
      aria-labelledby="education-heading"
      className="py-12 sm:py-24"
    >
      <div className="container mx-auto px-4">
        <h2 id="education-heading" className="text-2xl sm:text-3xl font-bold tracking-tight">
          Education
        </h2>
        {resume.education.length === 0 ? (
          <p className="mt-8 text-lg text-muted-foreground">
            No education entries defined.
          </p>
        ) : (
          <div className="mt-8 space-y-6">
            {resume.education.map((entry) => {
              const period = formatEducationPeriod(entry);
              const details = entry.details ?? [];
              return (
                <div key={entry.id} className="grid min-w-0 gap-4 [overflow-wrap:anywhere] lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">
                        {entry.qualification}
                      </h3>
                      {entry.isSample && (
                        <Badge variant="outline" className="shrink-0 text-xs">Sample</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {entry.institution}
                      {period ? ` · ${period}` : ""}
                    </p>
                  </div>
                  {details.length > 0 && (
                    <ul
                      className="min-w-0 text-sm text-muted-foreground list-disc list-inside space-y-1"
                      aria-label={`${entry.qualification} details`}
                    >
                      {details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
