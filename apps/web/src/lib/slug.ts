import { isSlug } from "@/lib/project-management";

/**
 * Turns human-entered text into a URL-safe slug, matching the API's
 * lowercase/digit/single-hyphen rule. Returns "" when nothing usable remains.
 */
export function slugify(base: string): string {
  const slug = base
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
  return isSlug(slug) ? slug : "";
}

/**
 * Generates a unique slug from the given parts, suffixing -2, -3, … when a
 * record with the same slug already exists, so the user is never blocked.
 */
export function generateSlug(parts: string[], existing: string[]): string {
  const base = slugify(parts.filter((part) => part.trim()).join("-"));
  if (!base) return "";
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`.slice(0, 100);
    if (!taken.has(candidate)) return candidate;
  }
  return base;
}
