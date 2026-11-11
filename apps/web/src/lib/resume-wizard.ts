import type { Section } from "@/lib/resume-import";

export type Step =
  | "profile"
  | "skills"
  | "projects"
  | "experience"
  | "education"
  | "contact"
  | "review";

export const STEPS = [
  "profile",
  "skills",
  "projects",
  "experience",
  "education",
  "contact",
  "review",
] as const satisfies readonly Step[];

export const STEP_LABELS: Record<Step, string> = {
  profile: "Profile",
  skills: "Skills",
  projects: "Projects",
  experience: "Experience",
  education: "Education",
  contact: "Contact",
  review: "Review",
};

const ALL_SECTIONS: Section[] = [
  "profile",
  "skills",
  "projects",
  "experience",
  "education",
  "contact",
  "links",
];

export function parseStep(value: string | string[] | null | undefined): Step {
  const raw = Array.isArray(value) ? value[0] : value;
  return STEPS.includes(raw as Step) ? (raw as Step) : "profile";
}

export function stepIndex(step: Step): number {
  return STEPS.indexOf(step);
}

export function stepHref(step: Step): string {
  return `/admin/resume?step=${step}`;
}

export function sectionsForStep(step: Step): Section[] {
  if (step === "review") return ALL_SECTIONS;
  if (step === "contact") return ["contact", "links"];
  return [step];
}

type StepStatus = {
  status: "complete" | "needs-details" | "optional" | "empty";
  detected: number;
};

/** First section still missing details, then the first with detected entries. */
export function nextReviewStep(summaries: Record<Step, StepStatus>): Step {
  for (const step of STEPS.slice(1, -1))
    if (summaries[step].status === "needs-details") return step;
  for (const step of STEPS.slice(1, -1))
    if (summaries[step].detected > 0) return step;
  return "review";
}
