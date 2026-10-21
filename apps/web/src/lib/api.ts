export const API_BASE_URL =
  process.env.API_BASE_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Resume types (mirrors the FastAPI response schemas)
// ---------------------------------------------------------------------------

export type ApiProfile = {
  id: number;
  name: string;
  headline: string;
  introduction: string;
  about: string;
  location: string | null;
};

export type ApiSkillItem = { id: number; item: string; display_order: number };
export type ApiSkillGroup = {
  id: number;
  label: string;
  display_order: number;
  items: ApiSkillItem[];
};

export type ApiHighlight = { id: number; text: string; display_order: number };
export type ApiExperience = {
  id: number;
  slug: string;
  role: string;
  organization: string;
  started: string;
  ended: string | null;
  current: boolean;
  description: string;
  display_order: number;
  highlights: ApiHighlight[];
};

export type ApiEducation = {
  id: number;
  slug: string;
  qualification: string;
  institution: string;
  started: string | null;
  ended: string | null;
  display_order: number;
};

export type ApiContactLink = {
  id: number;
  label: string;
  url: string;
  display_order: number;
};
export type ApiContact = {
  id: number;
  phone: string | null;
  email: string | null;
  links: ApiContactLink[];
};

export type ApiResume = {
  profile: ApiProfile | null;
  skills: ApiSkillGroup[];
  experience: ApiExperience[];
  education: ApiEducation[];
  contact: ApiContact | null;
};

const RESUME_TIMEOUT_MS = 5000;

export async function fetchResume(): Promise<ApiResume | null> {
  let controller: AbortController | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    controller = new AbortController();
    timeout = setTimeout(() => controller?.abort(), RESUME_TIMEOUT_MS);
    const response = await fetch(`${API_BASE_URL}/api/v1/resume`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as ApiResume;
  } catch {
    return null;
  } finally {
    if (timeout !== null) clearTimeout(timeout);
    controller = null;
  }
}

export type HealthStatus = { status: string } | null;

export type Project = {
  id: number;
  slug: string;
  title: string;
  summary: string;
  technologies: string[];
  repository_url: string | null;
  demo_url: string | null;
  display_order: number;
  is_sample: boolean;
};

export type ProjectsResponse = {
  items: Project[];
};

const HEALTH_TIMEOUT_MS = 5000;
const PROJECTS_TIMEOUT_MS = 5000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isProject(value: unknown): value is Project {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.id === "number" &&
    isString(value.slug) &&
    isString(value.title) &&
    isString(value.summary) &&
    Array.isArray(value.technologies) &&
    value.technologies.every(isString) &&
    (value.repository_url === null || isString(value.repository_url)) &&
    (value.demo_url === null || isString(value.demo_url)) &&
    typeof value.display_order === "number" &&
    typeof value.is_sample === "boolean"
  );
}

export function isProjectsResponse(
  value: unknown
): value is ProjectsResponse {
  return (
    isPlainObject(value) &&
    Array.isArray(value.items) &&
    value.items.every(isProject)
  );
}

export async function fetchHealth(): Promise<HealthStatus> {
  let controller: AbortController | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    controller = new AbortController();
    timeout = setTimeout(() => controller?.abort(), HEALTH_TIMEOUT_MS);
    const response = await fetch(`${API_BASE_URL}/api/v1/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as { status: string };
  } catch {
    return null;
  } finally {
    if (timeout !== null) clearTimeout(timeout);
    controller = null;
  }
}

export async function fetchProjects(): Promise<ProjectsResponse> {
  let controller: AbortController | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    controller = new AbortController();
    timeout = setTimeout(() => controller?.abort(), PROJECTS_TIMEOUT_MS);
    const response = await fetch(`${API_BASE_URL}/api/v1/projects`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-store" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Upstream projects request failed with HTTP ${response.status}`
      );
    }
    const data = await response.json();
    if (!isProjectsResponse(data)) {
      throw new Error("Invalid projects response payload");
    }
    return data;
  } finally {
    if (timeout !== null) clearTimeout(timeout);
    controller = null;
  }
}
