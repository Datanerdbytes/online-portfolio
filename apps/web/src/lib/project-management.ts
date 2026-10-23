import type { Project } from "@/lib/api";

export const MAX_ORDER = 2147483647;
export const MAX_BATCH = 100;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type WritableProjectFields = Pick<
  Project,
  | "title"
  | "summary"
  | "technologies"
  | "repository_url"
  | "demo_url"
  | "display_order"
>;

export const PROJECT_NO_CHANGES_MESSAGE =
  "Project details are unchanged. Screenshot uploads save immediately.";

export function projectUpdateBody(
  writable: WritableProjectFields,
  original: Project
): Partial<WritableProjectFields> | null {
  const body: Partial<WritableProjectFields> = {};
  for (const key of Object.keys(writable) as (keyof WritableProjectFields)[]) {
    if (JSON.stringify(writable[key]) !== JSON.stringify(original[key])) {
      Object.assign(body, { [key]: writable[key] });
    }
  }
  return Object.keys(body).length ? body : null;
}

export function isSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 100 &&
    SLUG_PATTERN.test(value)
  );
}
export function isStrictOrder(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_ORDER
  );
}
export function safeProjectLink(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^https?:\/\//i.test(value) ||
    value.length > 1024 ||
    /[\s\u0000-\u001f]/.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function isProject(value: unknown): value is Project {
  return (
    record(value) &&
    typeof value.id === "number" &&
    Number.isSafeInteger(value.id) &&
    value.id > 0 &&
    isSlug(value.slug) &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.technologies) &&
    value.technologies.every((item: unknown) => typeof item === "string") &&
    (value.repository_url === null ||
      typeof value.repository_url === "string") &&
    (value.demo_url === null || typeof value.demo_url === "string") &&
    (value.screenshot_url === undefined ||
      value.screenshot_url === null ||
      typeof value.screenshot_url === "string") &&
    (value.screenshot_updated_at === undefined ||
      value.screenshot_updated_at === null ||
      typeof value.screenshot_updated_at === "string") &&
    isStrictOrder(value.display_order) &&
    typeof value.is_sample === "boolean"
  );
}
export function isProjectsResponse(
  value: unknown
): value is { items: Project[] } {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    !value.items.every(isProject)
  )
    return false;
  return (
    new Set(value.items.map((p: Project) => p.id)).size ===
      value.items.length &&
    new Set(value.items.map((p: Project) => p.slug)).size === value.items.length
  );
}
export function projectResponse(project: Project): Project {
  const {
    id,
    slug,
    title,
    summary,
    technologies,
    repository_url,
    demo_url,
    display_order,
    is_sample,
    screenshot_url,
    screenshot_updated_at,
  } = project;
  return {
    id,
    slug,
    title,
    summary,
    technologies,
    repository_url,
    demo_url,
    display_order,
    is_sample,
    screenshot_url: screenshot_url ?? null,
    screenshot_updated_at: screenshot_updated_at ?? null,
  };
}
export function parseTechnologies(value: string): string[] | null {
  if (!value.trim()) return [];
  const items = value.split(",").map((item) => item.trim());
  return items.length <= 20 &&
    items.every((item) => item.length >= 1 && item.length <= 50) &&
    new Set(items).size === items.length
    ? items
    : null;
}
export function formTechnologies(
  value: string,
  original?: string[]
): string[] | null {
  // An unchanged CSV display must not rewrite a stored label containing a comma.
  return original && value === original.join(", ")
    ? original
    : parseTechnologies(value);
}
export function parseOrder(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return isStrictOrder(parsed) ? parsed : null;
}

export function orderedProjects(
  projects: Project[],
  drafts: Record<string, string>
) {
  const priority = (project: Project) =>
    parseOrder(drafts[project.slug] ?? "") ?? project.display_order;
  return [...projects].sort((a, b) => priority(a) - priority(b) || a.id - b.id);
}

export function moveProjectToPosition(
  projects: Project[],
  drafts: Record<string, string>,
  slug: string,
  position: number
): Record<string, string> {
  const current = orderedProjects(projects, drafts);
  const from = current.findIndex((project) => project.slug === slug);
  if (
    from < 0 ||
    !Number.isInteger(position) ||
    position < 0 ||
    position >= current.length ||
    from === position
  )
    return drafts;

  // Reuse priority slots, resolving ties so a move survives the API's ID tie-break.
  let previous = -1;
  let slots = current.map((project) => {
    previous = Math.max(
      previous + 1,
      parseOrder(drafts[project.slug] ?? "") ?? project.display_order
    );
    return previous;
  });
  if (previous > MAX_ORDER) slots = current.map((_, index) => index);
  const [moved] = current.splice(from, 1);
  current.splice(position, 0, moved);
  return Object.fromEntries(
    current.map((project, index) => [project.slug, String(slots[index])])
  );
}

export function changedOrders(
  projects: Project[],
  drafts: Record<string, string>
) {
  const orders: { slug: string; display_order: number }[] = [];
  for (const project of projects) {
    const order = parseOrder(
      drafts[project.slug] ?? String(project.display_order)
    );
    if (order === null)
      return {
        orders: null,
        error:
          "Each display order must be a whole number between 0 and 2147483647.",
      };
    if (order !== project.display_order)
      orders.push({ slug: project.slug, display_order: order });
  }
  return orders.length > MAX_BATCH
    ? {
        orders: null,
        error: "Save at most 100 changed projects in one atomic batch.",
      }
    : { orders, error: null };
}

export function failure(status: number) {
  switch (status) {
    case 400:
      return "The project values were rejected. Check the fields and try again.";
    case 401:
    case 403:
      return "Your session could not be verified. Sign in in another tab, then retry here. Your draft is preserved.";
    case 404:
      return "The project was not found. It may have been removed. Your draft is preserved.";
    case 409:
      return "A project with this slug already exists. Choose another slug.";
    case 429:
      return "Too many requests. Please try again later.";
    default:
      return "The projects service is unavailable. Please try again.";
  }
}
