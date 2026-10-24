export const IMPORT_MAX_BYTES = 3 * 1024 * 1024;
export type Section =
  | "profile"
  | "contact"
  | "skills"
  | "experience"
  | "education"
  | "projects"
  | "links";
export type Values = Record<string, string | boolean | string[] | null>;
export type Entry = { id: number; values: Values };
export type Candidate = {
  section: Section;
  values: Values;
  evidence: Record<string, string | string[]>;
  generated: string[];
  warnings: string[];
};
export type ImportContext = {
  resume: {
    profile: (Values & { id: number }) | null;
    contact: {
      id: number;
      email: string | null;
      phone: string | null;
      links: Array<{ id: number; label: string; url: string }>;
    } | null;
    skills: Array<{
      id: number;
      label: string;
      items: Array<{ item: string }>;
    }>;
    experience: Array<{
      id: number;
      role: string;
      organization: string;
      started: string;
      ended: string | null;
      current: boolean;
      description: string;
      highlights: Array<{ text: string }>;
    }>;
    education: Array<{
      id: number;
      qualification: string;
      institution: string;
      started: string | null;
      ended: string | null;
    }>;
  };
  projects: {
    items: Array<{
      id: number;
      title: string;
      summary: string;
      technologies: string[];
      repository_url: string | null;
      demo_url: string | null;
    }>;
  };
  status: { revision: number; profile_complete: boolean; owner_id: string };
  enabled: boolean;
  can_read_locally?: boolean;
};
export const sectionFields: Record<Section, string[]> = {
  profile: ["name", "headline", "introduction", "about", "location"],
  contact: ["email", "phone"],
  skills: ["label", "items"],
  experience: [
    "role",
    "organization",
    "started",
    "ended",
    "current",
    "description",
    "highlights",
  ],
  education: ["qualification", "institution", "started", "ended"],
  projects: ["title", "summary", "technologies", "repository_url", "demo_url"],
  links: ["label", "url"],
};
export const required: Record<Section, string[]> = {
  profile: [],
  contact: [],
  skills: ["label"],
  experience: ["role", "organization", "started"],
  education: ["qualification", "institution"],
  projects: ["title", "summary"],
  links: ["label", "url"],
};
export function entries(context: ImportContext, section: Section): Entry[] {
  const r = context.resume;
  if (section === "profile")
    return r.profile
      ? [
          {
            id: r.profile.id,
            values: Object.fromEntries(
              sectionFields.profile.map((k) => [k, r.profile![k]])
            ),
          },
        ]
      : [];
  if (section === "contact")
    return r.contact
      ? [
          {
            id: r.contact.id,
            values: { email: r.contact.email, phone: r.contact.phone },
          },
        ]
      : [];
  if (section === "links")
    return (r.contact?.links ?? []).map((x) => ({
      id: x.id,
      values: { label: x.label, url: x.url },
    }));
  if (section === "skills")
    return r.skills.map((x) => ({
      id: x.id,
      values: { label: x.label, items: x.items.map((i) => i.item) },
    }));
  if (section === "experience")
    return r.experience.map((x) => ({
      id: x.id,
      values: {
        role: x.role,
        organization: x.organization,
        started: x.started,
        ended: x.ended,
        current: x.current,
        description: x.description,
        highlights: x.highlights.map((h) => h.text),
      },
    }));
  if (section === "education")
    return r.education.map((x) => ({
      id: x.id,
      values: {
        qualification: x.qualification,
        institution: x.institution,
        started: x.started,
        ended: x.ended,
      },
    }));
  return context.projects.items.map((x) => ({
    id: x.id,
    values: {
      title: x.title,
      summary: x.summary,
      technologies: x.technologies,
      repository_url: x.repository_url,
      demo_url: x.demo_url,
    },
  }));
}
const normalize = (value: unknown) =>
  typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : "";
export function suggestedTarget(
  candidate: Candidate,
  existing: Entry[]
): number | null {
  if (["profile", "contact"].includes(candidate.section))
    return existing[0]?.id ?? null;
  const keys = {
    skills: ["label"],
    experience: ["role", "organization", "started"],
    education: ["qualification", "institution"],
    projects: ["title"],
    links: ["url"],
  }[candidate.section as Exclude<Section, "profile" | "contact">];
  const matches = existing.filter((x) =>
    keys.every(
      (k) =>
        normalize(candidate.values[k]) &&
        normalize(candidate.values[k]) === normalize(x.values[k])
    )
  );
  return matches.length === 1 ? matches[0].id : null;
}
export function display(value: unknown): string {
  return Array.isArray(value)
    ? value.join("\n")
    : value == null
      ? ""
      : String(value);
}
export function candidateValid(value: unknown): value is Candidate {
  if (!value || typeof value !== "object") return false;
  const c = value as Candidate;
  return (
    typeof c.section === "string" &&
    Object.hasOwn(sectionFields, c.section) &&
    c.values !== null &&
    typeof c.values === "object" &&
    !Array.isArray(c.values) &&
    Object.entries(c.values).every(
      ([k, v]) =>
        sectionFields[c.section].includes(k) &&
        (v === null ||
          typeof v === "string" ||
          typeof v === "boolean" ||
          (Array.isArray(v) && v.every((x) => typeof x === "string")))
    ) &&
    !!c.evidence &&
    typeof c.evidence === "object" &&
    Object.values(c.evidence).every(
      (v) =>
        typeof v === "string" ||
        (Array.isArray(v) && v.every((x) => typeof x === "string"))
    ) &&
    Array.isArray(c.generated) &&
    c.generated.every((v) => typeof v === "string") &&
    Array.isArray(c.warnings) &&
    c.warnings.every((v) => typeof v === "string")
  );
}
