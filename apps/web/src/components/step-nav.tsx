"use client";

import { cn } from "@/lib/utils";
import type { SectionSummary, SectionStatus } from "@/lib/resume-review";
import { STEP_LABELS, STEPS, stepIndex, type Step } from "@/lib/resume-wizard";

const tone: Record<SectionStatus, string> = {
  complete: "text-emerald-700 dark:text-emerald-400",
  "needs-details": "text-destructive",
  optional: "text-amber-700 dark:text-amber-400",
  empty: "text-muted-foreground",
};

function statusText(step: Step, summary: SectionSummary): string {
  if (step === "review")
    return summary.status === "needs-details" ? "Needs details" : "Ready";
  if (summary.status === "complete") return "Complete";
  if (summary.status === "needs-details") return "Needs details";
  // Detected entries that are not included yet (import review only).
  if (summary.status === "optional") return "Detected";
  return "Nothing yet";
}

type Props = {
  step: Step;
  summaries: Record<Step, SectionSummary>;
  onSelect: (step: Step) => void;
};

// Wrapping stepper: one pill per step with the number, label, and status, so
// narrow screens flow onto multiple lines instead of scrolling horizontally.
// A chevron between pills keeps the timeline reading order.
export function StepNav({ step, summaries, onSelect }: Props) {
  return (
    <nav aria-label="Resume steps" className="space-y-3">
      <p role="status" className="text-sm text-muted-foreground">
        Step {stepIndex(step) + 1} of {STEPS.length} · {STEP_LABELS[step]}
      </p>
      <ol className="flex flex-wrap items-start gap-x-1 gap-y-2">
        {STEPS.map((value, index) => {
          const current = value === step;
          const summary = summaries[value];
          const complete = summary.status === "complete";
          return (
            <li key={value} className="flex items-start gap-1">
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                onClick={() => onSelect(value)}
                className={cn(
                  "flex min-w-24 flex-col items-center gap-1 rounded-md px-2 py-2 text-center text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  current && "bg-muted/60"
                )}
              >
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
              {index < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="mt-4 select-none text-muted-foreground"
                >
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
