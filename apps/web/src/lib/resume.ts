import type { Education, Experience } from "@/content/resume";
import type { ApiEducation, ApiExperience } from "@/lib/api";

export function isAbsoluteHttpUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function formatExperiencePeriod(
  job: Pick<Experience | ApiExperience, "started" | "ended" | "current">
): string {
  const parts: string[] = [];
  if (job.started) parts.push(job.started);
  const end = job.current ? "Present" : job.ended;
  if (end) parts.push(end);
  return parts.join(" – ");
}

export function formatEducationPeriod(
  education: Pick<Education | ApiEducation, "started" | "ended">
): string {
  const parts: string[] = [];
  if (education.started) parts.push(education.started);
  if (education.ended) parts.push(education.ended);
  return parts.join(" – ");
}
