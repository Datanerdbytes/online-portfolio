import "server-only";
import { cache } from "react";
import {
  API_BASE_URL,
  type ApiContact,
  type ApiEducation,
  type ApiExperience,
  type ApiProfile,
  type ApiResume,
  type ApiSkillGroup,
  type Project,
} from "@/lib/api";

export type PublicSectionState<T> =
  { status: "ok"; data: T } | { status: "missing" } | { status: "unavailable" };

const SECTION_TIMEOUT_MS = 8000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isProfile(value: unknown): value is ApiProfile {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.name === "string" &&
    typeof value.headline === "string" &&
    typeof value.introduction === "string" &&
    typeof value.about === "string"
  );
}

function isContact(value: unknown): value is ApiContact {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    Array.isArray(value.links)
  );
}

function itemsOf<T>(value: unknown): T[] | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  return value.items as T[];
}

async function fetchSection<T>(
  userId: string | null,
  section: string,
  parse: (value: unknown) => T | null
): Promise<PublicSectionState<T>> {
  const owner = userId ? `users/${encodeURIComponent(userId)}/` : "";
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/public/${owner}${section}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(SECTION_TIMEOUT_MS),
    });
  } catch {
    return { status: "unavailable" };
  }
  if (response.status === 404) return { status: "missing" };
  if (!response.ok) return { status: "unavailable" };
  try {
    const data = parse(await response.json());
    return data ? { status: "ok", data } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export const getAboutState = cache((userId: string | null) =>
  fetchSection(userId, "about", (value) => (isProfile(value) ? value : null))
);

export const getSkillsState = cache((userId: string | null) =>
  fetchSection(userId, "skills", (value) => itemsOf<ApiSkillGroup>(value))
);

export const getExperienceState = cache((userId: string | null) =>
  fetchSection(userId, "experience", (value) => itemsOf<ApiExperience>(value))
);

export const getEducationState = cache((userId: string | null) =>
  fetchSection(userId, "education", (value) => itemsOf<ApiEducation>(value))
);

export const getContactState = cache((userId: string | null) =>
  fetchSection(userId, "contact", (value) => (isContact(value) ? value : null))
);

export const getProjectsState = cache((userId: string | null) =>
  fetchSection(userId, "projects", (value) => itemsOf<Project>(value))
);

/** Reads a whole published portfolio from its section endpoints. */
export async function loadPublicResumeSections(
  userId: string | null
): Promise<PublicSectionState<ApiResume>> {
  const [about, skills, experience, education, contact] = await Promise.all([
    getAboutState(userId),
    getSkillsState(userId),
    getExperienceState(userId),
    getEducationState(userId),
    getContactState(userId),
  ]);

  if (
    about.status === "missing" ||
    skills.status === "missing" ||
    experience.status === "missing" ||
    education.status === "missing"
  ) {
    return { status: "missing" };
  }
  if (
    about.status !== "ok" ||
    skills.status !== "ok" ||
    experience.status !== "ok" ||
    education.status !== "ok" ||
    contact.status === "unavailable"
  ) {
    return { status: "unavailable" };
  }

  return {
    status: "ok",
    data: {
      profile: about.data,
      skills: skills.data,
      experience: experience.data,
      education: education.data,
      contact: contact.status === "ok" ? contact.data : null,
    },
  };
}
