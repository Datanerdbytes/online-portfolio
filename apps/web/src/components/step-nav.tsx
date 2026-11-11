"use client";

import { cn } from "@/lib/utils";
import type { SectionSummary, SectionStatus } from "@/lib/resume-review";
import { STEP_LABELS, STEPS, stepIndex, type Step } from "@/lib/resume-wizard";

const tone: Record<SectionStatus, string> = {
  complete: "border-emerald-600/40 text-emerald-700 dark:text-emerald-400",
  "needs-details": "border-destructive/40 text-destructive",
  optional: "border-border text-muted-foreground",
  empty: "border-border text-muted-foreground",
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

export function StepNav({ step, summaries, onSelect }: Props) {
  return (
    <nav aria-label="Resume steps" className="space-y-3">
      <p role="status" className="text-sm text-muted-foreground">
        Step {stepIndex(step) + 1} of {STEPS.length} · {STEP_LABELS[step]}
      </p>
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((value, index) => {
          const current = value === step;
          return (
            <li key={value}>
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                onClick={() => onSelect(value)}
                className={cn(
                  "inline-flex min-h-11 flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  current
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted"
                )}
              >
                <span className="font-medium">
                  {index + 1}. {STEP_LABELS[value]}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs",
                    current ? "border-current" : tone[summaries[value].status]
                  )}
                >
                  {statusText(value, summaries[value])}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
