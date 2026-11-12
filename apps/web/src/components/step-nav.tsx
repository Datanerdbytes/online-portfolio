"use client";

import { cn } from "@/lib/utils";
import type { SectionSummary, SectionStatus } from "@/lib/resume-review";
import { STEP_LABELS, STEPS, stepIndex, type Step } from "@/lib/resume-wizard";

const tone: Record<SectionStatus, string> = {
  complete: "text-emerald-700 dark:text-emerald-400",
  "needs-details": "text-destructive",
  optional: "text-muted-foreground",
  empty: "text-muted-foreground",
};

function statusText(step: Step, summary: SectionSummary): string {
  if (step === "review")
    return summary.status === "needs-details" ? "Needs details" : "Ready";
  if (summary.status === "complete") return "Complete";
  if (summary.status === "needs-details") return "Needs details";
  if (summary.status === "optional") return "Review";
  return "Optional";
}

type Props = {
  step: Step;
  summaries: Record<Step, SectionSummary>;
  onSelect: (step: Step) => void;
};

// Horizontal stepper: one column per step with the label on top, the status
// text just above the track, and a light-gray line running behind every
// bullet from the first step to the last. The track scrolls horizontally
// when the viewport is narrower than the seven columns.
export function StepNav({ step, summaries, onSelect }: Props) {
  return (
    <nav aria-label="Resume steps" className="space-y-3">
      <p role="status" className="text-sm text-muted-foreground">
        Step {stepIndex(step) + 1} of {STEPS.length} · {STEP_LABELS[step]}
      </p>
      <div className="overflow-x-auto p-1">
        <ol className="grid min-w-[48rem] grid-cols-7">
          {STEPS.map((value, index) => {
            const current = value === step;
            const summary = summaries[value];
            const complete = summary.status === "complete";
            return (
              <li key={value} className="relative">
                {index < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 top-[4.125rem] h-px w-full bg-muted-foreground"
                  />
                )}
                <button
                  type="button"
                  aria-current={current ? "step" : undefined}
                  onClick={() => onSelect(value)}
                  className="flex h-20 w-full flex-col items-center rounded-md px-1 pb-2 pt-2 text-center text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span className="flex h-[3.25rem] flex-col items-center gap-1">
                    <span
                      className={cn(
                        "font-medium",
                        current && "font-semibold text-primary"
                      )}
                    >
                      {index + 1}. {STEP_LABELS[value]}
                    </span>
                    <span className={cn("text-xs", tone[summary.status])}>
                      {statusText(value, summary)}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-3 w-3 shrink-0 rounded-full border-2",
                      complete
                        ? "border-primary bg-primary"
                        : "border-primary bg-background"
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
