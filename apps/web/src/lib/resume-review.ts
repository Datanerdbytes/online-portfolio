import {
  display,
  entries,
  required,
  sectionFields,
  suggestedTarget,
  type Candidate,
  type Entry,
  type ImportContext,
  type Section,
  type Values,
} from "@/lib/resume-import";
import { sectionsForStep, type Step } from "@/lib/resume-wizard";

export type Review = {
  candidate: Candidate;
  active: boolean;
  target: number | null;
  values: Values;
  selected: Record<string, boolean>;
};

export const labels: Record<string, string> = {
  profile: "Profile",
  contact: "Contact details",
  skills: "Skills",
  experience: "Experience",
  education: "Education",
  projects: "Projects",
  links: "Contact links",
  started: "Start date (YYYY-MM)",
  ended: "End date (YYYY-MM)",
  current: "Current role",
  repository_url: "Repository URL",
  demo_url: "Demo URL",
  items: "Skills (one per line)",
  highlights: "Highlights (one per line)",
  technologies: "Technologies (one per line)",
};

export const label = (key: string) =>
  labels[key] ?? key.charAt(0).toUpperCase() + key.slice(1);

function hasRequired(section: Section, values: Values): boolean {
  return required[section].every((key) => display(values[key]).trim());
}

/** An extracted entry is safe to include once every required value is present. */
export function readyToInclude(candidate: Candidate): boolean {
  return hasRequired(candidate.section, candidate.values);
}

export function makeReview(
  candidate: Candidate,
  context: ImportContext
): Review {
  const existing = entries(context, candidate.section);
  const target = suggestedTarget(candidate, existing);
  const current = existing.find((x) => x.id === target)?.values ?? {};
  return {
    candidate,
    target,
    active:
      ["profile", "contact"].includes(candidate.section) ||
      readyToInclude(candidate),
    values: { ...candidate.values },
    selected: Object.fromEntries(
      sectionFields[candidate.section].map((key) => [
        key,
        !display(current[key]) &&
          candidate.values[key] != null &&
          !candidate.generated.includes(key),
      ])
    ),
  };
}

export function currentValues(review: Review, context: ImportContext): Values {
  return (
    entries(context, review.candidate.section).find(
      (x) => x.id === review.target
    )?.values ?? {}
  );
}

export function selectedValues(review: Review): Values {
  return Object.fromEntries(
    Object.entries(review.values).filter(
      ([k, v]) => review.selected[k] && v !== null && v !== ""
    )
  );
}

export function merged(review: Review, context: ImportContext): Values {
  return { ...currentValues(review, context), ...selectedValues(review) };
}

/** Include a ready entry and preselect values that do not replace saved data. */
export function includeReadyReview(
  review: Review,
  context: ImportContext
): Review {
  if (!hasRequired(review.candidate.section, review.values)) return review;
  const current = currentValues(review, context);
  const selected = { ...review.selected };
  for (const key of sectionFields[review.candidate.section])
    if (
      !selected[key] &&
      !display(current[key]).trim() &&
      display(review.values[key]).trim() &&
      !review.candidate.generated.includes(key)
    )
      selected[key] = true;
  return { ...review, active: true, selected };
}

export function excludeReview(review: Review): Review {
  return { ...review, active: false };
}

export function skipMatchedReview(review: Review): Review {
  return review.target == null ? review : { ...review, active: false };
}

export function issues(review: Review, context: ImportContext): string[] {
  if (!review.active || !Object.keys(selectedValues(review)).length) return [];
  const value = merged(review, context);
  const section = review.candidate.section;
  const problems = required[section]
    .filter((k) => !display(value[k]).trim())
    .map((k) => `${label(k)} is required for this entry.`);
  for (const key of ["started", "ended"])
    if (value[key] && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value[key])))
      problems.push(
        `${label(key)} needs a complete YYYY-MM date; do not guess.`
      );
  if (section === "experience" && !value.current && !value.ended)
    problems.push(
      "Supply an end date or explicitly mark this role as current."
    );
  if (
    value.started &&
    value.ended &&
    String(value.ended) < String(value.started)
  )
    problems.push("End date must follow start date.");
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value.email)))
    problems.push("Check this email address.");
  for (const key of ["url", "repository_url", "demo_url"])
    if (value[key]) {
      try {
        const u = new URL(String(value[key]));
        if (
          !["http:", "https:"].includes(u.protocol) ||
          u.username ||
          u.password
        )
          throw new Error();
      } catch {
        problems.push(`${label(key)} needs a valid http or https link.`);
      }
    }
  return problems;
}

export type Change = {
  section: Section;
  target_id: number | null;
  values: Values;
};

export function changesForSave(reviews: Review[]): Change[] {
  return reviews
    .filter((r) => r.active && Object.keys(selectedValues(r)).length)
    .map((r) => ({
      section: r.candidate.section,
      target_id: ["profile", "contact"].includes(r.candidate.section)
        ? null
        : r.target,
      values: selectedValues(r),
    }));
}

export const PUBLISH_REQUIRED = ["name", "headline", "introduction"];

export function missingProfileFields(
  context: ImportContext,
  reviews: Review[]
): string[] {
  const profile = {
    ...(context.resume.profile ?? {}),
    ...Object.assign(
      {},
      ...reviews
        .filter((r) => r.active && r.candidate.section === "profile")
        .map(selectedValues)
    ),
  };
  return PUBLISH_REQUIRED.filter((k) => !display(profile[k]).trim());
}

export type EffectiveEntry = Entry & { proposed?: boolean };

/** Saved entries with accepted proposal values merged, plus proposed new entries. */
export function effectiveEntries(
  context: ImportContext,
  section: Section,
  reviews: Review[]
): EffectiveEntry[] {
  const result: EffectiveEntry[] = entries(context, section).map((entry) => ({
    id: entry.id,
    values: { ...entry.values },
  }));
  const accepted = reviews.filter(
    (r) =>
      r.active &&
      r.candidate.section === section &&
      Object.keys(selectedValues(r)).length > 0
  );
  accepted.forEach((review, index) => {
    const values = selectedValues(review);
    const existing =
      review.target == null
        ? undefined
        : result.find((entry) => entry.id === review.target);
    if (existing) existing.values = { ...existing.values, ...values };
    else result.push({ id: -1 - index, values, proposed: true });
  });
  return result;
}

export type SectionStatus = "complete" | "needs-details" | "optional" | "empty";

export type SectionSummary = {
  saved: number;
  detected: number;
  accepted: number;
  missingRequired: number;
  blocking: string[];
  status: SectionStatus;
};

export function sectionSummary(
  context: ImportContext | null,
  step: Step,
  reviews: Review[]
): SectionSummary {
  if (!context)
    return {
      saved: 0,
      detected: 0,
      accepted: 0,
      missingRequired: 0,
      blocking: [],
      status:
        step === "profile" || step === "review" ? "needs-details" : "empty",
    };
  const sections = sectionsForStep(step);
  const relevant = reviews.filter((r) =>
    sections.includes(r.candidate.section)
  );
  const accepted = relevant.filter(
    (r) => r.active && Object.keys(selectedValues(r)).length > 0
  );
  const blocking = relevant.flatMap((r) => issues(r, context));
  const saved = sections.reduce(
    (count, section) => count + entries(context, section).length,
    0
  );
  const effective = sections.flatMap((section) =>
    effectiveEntries(context, section, reviews)
  );
  let missingRequired = 0;
  for (const section of sections)
    for (const entry of effectiveEntries(context, section, reviews))
      missingRequired += required[section].filter(
        (key) => !display(entry.values[key]).trim()
      ).length;
  if (sections.includes("profile"))
    missingRequired += missingProfileFields(context, reviews).length;

  const status: SectionStatus =
    blocking.length > 0 || missingRequired > 0
      ? "needs-details"
      : effective.length > 0
        ? "complete"
        : relevant.length > 0
          ? "optional"
          : "empty";

  return {
    saved,
    detected: relevant.length,
    accepted: accepted.length,
    missingRequired,
    blocking,
    status,
  };
}
