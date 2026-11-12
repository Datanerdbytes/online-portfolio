import type { Project } from "@/lib/api";

export const MAX_ORDER = 2147483647;
export const MAX_BATCH = 100;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type WritableProjectFields = Pick<
  Project,
  | "title"
  | "summary"
  | "technologies"
  | "highlights"
  | "repository_url"
  | "demo_url"
  | "display_order"
>;

export const PROJECT_NO_CHANGES_MESSAGE =
  "No field changes to save. Screenshot uploads and removals save to your draft immediately.";

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
    (value.highlights === undefined ||
      (Array.isArray(value.highlights) &&
        value.highlights.every((item: unknown) => typeof item === "string"))) &&
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
    highlights,
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
    highlights: highlights ?? [],
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
export function parseHighlights(value: string): string[] | null {
  // One bullet per line; blank lines are layout, not entries. Duplicates that
  // differ only in case collapse to the first spelling, matching the API.
  const items = value
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of items) {
    if (item.length > 500) return null;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(item);
  }
  return cleaned.length <= 20 ? cleaned : null;
}
export function formHighlights(
  value: string,
  original?: string[]
): string[] | null {
  // An unchanged multiline display must not drop or rewrite stored bullets.
  return original && value === original.join("\n")
    ? original
    : parseHighlights(value);
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

export type ProjectFormValues = {
  slug: string;
  title: string;
  summary: string;
  technologies: string;
  highlights: string;
  repository_url: string;
  demo_url: string;
  display_order: string;
};

export function blankProjectForm(): ProjectFormValues {
  return {
    slug: "",
    title: "",
    summary: "",
    technologies: "",
    highlights: "",
    repository_url: "",
    demo_url: "",
    display_order: "0",
  };
}

export function projectFormFor(project: Project): ProjectFormValues {
  return {
    slug: project.slug,
    title: project.title,
    summary: project.summary,
    technologies: project.technologies.join(", "),
    highlights: (project.highlights ?? []).join("\n"),
    repository_url: project.repository_url ?? "",
    demo_url: project.demo_url ?? "",
    display_order: String(project.display_order),
  };
}

// Parsed form output with the arrays the API requires, distinct from the
// optional-field Project shape it was parsed from.
export type ParsedProjectValues = {
  title: string;
  summary: string;
  technologies: string[];
  highlights: string[];
  repository_url: string | null;
  demo_url: string | null;
  display_order: number;
};

export type ParsedProjectForm =
  | { values: ParsedProjectValues; error: null }
  | { values: null; error: string };

export function parseProjectForm(
  values: ProjectFormValues,
  original?: Project | null
): ParsedProjectForm {
  const title = values.title.trim(),
    summary = values.summary.trim();
  const technologies = formTechnologies(
    values.technologies,
    original?.technologies
  );
  const highlights = formHighlights(values.highlights, original?.highlights);
  const order = parseOrder(values.display_order);
  const repository = values.repository_url.trim(),
    demo = values.demo_url.trim();
  const repositoryChanged =
    !original || repository !== (original.repository_url ?? "");
  const demoChanged = !original || demo !== (original.demo_url ?? "");
  if (!title || title.length > 200 || !summary || summary.length > 1000) {
    return {
      values: null,
      error:
        "Title must contain 1–200 characters and summary 1–1000 characters.",
    };
  }
  if (technologies === null) {
    return {
      values: null,
      error:
        "Use 0–20 unique technologies, each 1–50 characters, separated by commas. Leave blank for none.",
    };
  }
  if (highlights === null) {
    return {
      values: null,
      error:
        "Use 0–20 unique highlights, each 1–500 characters, one per line. Leave blank for none.",
    };
  }
  if (
    (repositoryChanged && repository && !safeProjectLink(repository)) ||
    (demoChanged && demo && !safeProjectLink(demo))
  ) {
    return {
      values: null,
      error:
        "URLs must be absolute HTTP(S) URLs of at most 1024 characters, or blank.",
    };
  }
  if (order === null) {
    return {
      values: null,
      error: "Sort priority must be a whole number between 0 and 2147483647.",
    };
  }
  return {
    values: {
      title,
      summary,
      technologies,
      highlights,
      repository_url: repository || null,
      demo_url: demo || null,
      display_order: order,
    },
    error: null,
  };
}

// Semantic replacement for the wizard's DOM-snapshot dirty check on the
// projects step: true only when the draft really holds unsaved edits.
export function projectEditsPending(
  mode: "list" | "create" | "edit",
  values: ProjectFormValues,
  original?: Project | null
): boolean {
  if (mode === "list") return false;
  if (mode === "create") {
    const blank = blankProjectForm();
    for (const key of Object.keys(blank) as (keyof ProjectFormValues)[]) {
      if (values[key] !== blank[key]) return true;
    }
    return false;
  }
  if (!original) return true;
  const parsed = parseProjectForm(values, original);
  if (parsed.values === null) return true; // invalid edits are still edits
  return (
    projectUpdateBody(parsed.values, {
      ...original,
      highlights: original.highlights ?? [],
    }) !== null
  );
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
