import { resume as staticResume } from "@/content/resume";
import type {
  ApiContact,
  ApiEducation,
  ApiExperience,
  ApiProfile,
  ApiResume,
  ApiSkillGroup,
  Project,
} from "@/lib/api";
import type { Education, Experience } from "@/content/resume";

export function isAbsoluteHttpUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Formats a `YYYY-MM` (or `YYYY`) month/year value as `Mon YYYY`.
 * Values that do not follow that shape are returned untouched.
 */
export function formatResumeDate(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  const match = /^(\d{4})(?:-(\d{2}))?/.exec(trimmed);
  if (!match) return trimmed;
  const year = match[1];
  if (!match[2]) return year;
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return trimmed;
  return `${MONTH_LABELS[monthIndex]} ${year}`;
}

export function formatExperiencePeriod(
  job: Pick<Experience | ApiExperience, "started" | "ended" | "current">
): string {
  const parts: string[] = [];
  const start = formatResumeDate(job.started);
  if (start) parts.push(start);
  const end = job.current ? "Present" : formatResumeDate(job.ended);
  if (end) parts.push(end);
  return parts.join(" – ");
}

export function formatEducationPeriod(
  education: Pick<Education | ApiEducation, "started" | "ended">
): string {
  const parts: string[] = [];
  const start = formatResumeDate(education.started);
  if (start) parts.push(start);
  const end = formatResumeDate(education.ended);
  if (end) parts.push(end);
  return parts.join(" – ");
}

export type ResumeSource = "api" | "static";

export type ResolvedResume = {
  profile: ApiProfile;
  skills: ApiSkillGroup[];
  experience: ApiExperience[];
  education: ApiEducation[];
  contact: ApiContact;
  /** Where the content came from: the live API or the repository fallback. */
  source: ResumeSource;
  /** True when the content is explicitly marked as placeholder material. */
  isSample: boolean;
  sampleNotice: string | null;
};

function staticProfile(): ApiProfile {
  return {
    id: 0,
    name: staticResume.profile.name,
    headline: staticResume.profile.headline,
    introduction: staticResume.profile.introduction,
    about: staticResume.profile.about,
    location: staticResume.profile.location ?? null,
  };
}

function staticSkills(): ApiSkillGroup[] {
  return staticResume.skills.map((group, groupIndex) => ({
    id: groupIndex,
    label: group.label,
    display_order: groupIndex,
    items: group.items.map((item, itemIndex) => ({
      id: itemIndex,
      item,
      display_order: itemIndex,
    })),
  }));
}

function staticExperience(): ApiExperience[] {
  return staticResume.experience.map((entry, index) => ({
    id: index,
    slug: entry.id,
    role: entry.role,
    organization: entry.organization,
    started: entry.started,
    ended: entry.ended ?? null,
    current: entry.current,
    description: entry.description,
    display_order: index,
    highlights: (entry.highlights ?? []).map((text, highlightIndex) => ({
      id: highlightIndex,
      text,
      display_order: highlightIndex,
    })),
  }));
}

function staticEducation(): ApiEducation[] {
  return staticResume.education.map((entry, index) => ({
    id: index,
    slug: entry.id,
    qualification: entry.qualification,
    institution: entry.institution,
    started: entry.started ?? null,
    ended: entry.ended ?? null,
    display_order: index,
  }));
}

function staticContact(): ApiContact {
  return {
    id: 0,
    phone: staticResume.contact.phone ?? null,
    email: staticResume.contact.email ?? null,
    links: (staticResume.contact.links ?? []).map((link, index) => ({
      id: index,
      label: link.label,
      url: link.url,
      display_order: index,
    })),
  };
}

function staticProjects(): Project[] {
  return staticResume.projects.map((project, index) => ({
    id: index,
    slug: project.id,
    title: project.title,
    summary: project.summary,
    technologies: project.technologies,
    repository_url: project.repositoryUrl ?? null,
    demo_url: project.demoUrl ?? null,
    display_order: index,
    is_sample: project.isSample,
  }));
}

/**
 * Returns the project list stored in the repository. Used as the fallback
 * when the API is unavailable, so the resume keeps every published project.
 */
export function staticResumeProjects(): Project[] {
  return staticProjects();
}

/**
 * Resolves the project list from the API, falling back to the repository copy
 * when the API returns nothing.
 */
export function resolveProjects(apiProjects: Project[] | null): Project[] {
  if (apiProjects && apiProjects.length > 0) return apiProjects;
  return staticProjects();
}

/**
 * Normalizes live API content and the repository fallback into one shape so
 * the homepage and the printable resume page render from identical data.
 */
export function resolveResume(apiResume: ApiResume | null): ResolvedResume {
  const source: ResumeSource = apiResume ? "api" : "static";
  const hasApiContent = Boolean(
    apiResume?.profile ||
      (apiResume?.skills.length ?? 0) > 0 ||
      (apiResume?.experience.length ?? 0) > 0
  );

  return {
    profile: apiResume?.profile ?? staticProfile(),
    skills:
      apiResume && apiResume.skills.length > 0
        ? apiResume.skills
        : staticSkills(),
    experience:
      apiResume && apiResume.experience.length > 0
        ? apiResume.experience
        : staticExperience(),
    education:
      apiResume && apiResume.education.length > 0
        ? apiResume.education
        : staticEducation(),
    contact: apiResume?.contact ?? staticContact(),
    source,
    isSample: hasApiContent ? false : staticResume.isSample,
    sampleNotice: hasApiContent ? null : (staticResume.sampleNotice ?? null),
  };
}
