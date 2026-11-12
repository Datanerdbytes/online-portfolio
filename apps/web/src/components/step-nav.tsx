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

// Vertical stepper: each row starts with a bullet (filled orange once the
// step is complete, hollow otherwise) and rows are joined by a short line
// segment so the bullets read as one connected timeline.
export function StepNav({ step, summaries, onSelect }: Props) {
  return (
    <nav aria-label="Resume steps" className="space-y-3">
      <p role="status" className="text-sm text-muted-foreground">
        Step {stepIndex(step) + 1} of {STEPS.length} · {STEP_LABELS[step]}
      </p>
      <ol>
        {STEPS.map((value, index) => {
          const current = value === step;
          const summary = summaries[value];
          const complete = summary.status === "complete";
          return (
            <li key={value} className="relative">
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute left-[5.5px] top-0 h-[18px] w-px bg-border"
                />
              )}
              {index < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-[5.5px] top-[18px] w-px bg-border"
                />
              )}
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                onClick={() => onSelect(value)}
                className={cn(
                  "flex min-h-11 w-full items-start gap-2 rounded-md py-2 pr-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  current ? "bg-primary/10" : "hover:bg-muted/50"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1 h-3 w-3 shrink-0 rounded-full border-2",
                    complete
                      ? "border-primary bg-primary"
                      : "border-primary bg-background"
                  )}
                />
                <span className="flex flex-wrap items-baseline gap-x-2">
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
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
