/**
 * Avatar helpers, constants, and the project-screenshot upload rules.
 *
 * Pure module so it can be used by both client and server code and remains
 * easy to load in the Node test harness.
 */

export const AVATAR_PATH = "/api/resume/profile/avatar";
export const BANNER_PATH = "/api/resume/profile/banner";
export type ProfileImageKind = "avatar" | "banner";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_UPLOAD_MAX_BYTES = AVATAR_MAX_BYTES + 64 * 1024;

export const AVATAR_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Project screenshots additionally accept GIFs, which the API stores verbatim
 * so their animation survives. Raster images are resized to a thumbnail.
 */
export const SCREENSHOT_CONTENT_TYPES = [
  ...AVATAR_CONTENT_TYPES,
  "image/gif",
] as const;
export const SCREENSHOT_ACCEPT = `${AVATAR_ACCEPT},image/gif`;

export function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    const part = parts[0];
    return part.slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function profileImageUrl(
  avatarUrl: string | null | undefined,
  avatarUpdatedAt: string | Date | null | undefined,
  imagePath = AVATAR_PATH
): string | null {
  if (!avatarUrl) {
    return null;
  }
  if (avatarUrl.startsWith("/api/v1/public/"))
    imagePath = avatarUrl.replace("/api/v1/", "/api/");
  if (!avatarUpdatedAt) {
    return imagePath;
  }
  const date =
    typeof avatarUpdatedAt === "string"
      ? new Date(avatarUpdatedAt)
      : avatarUpdatedAt;
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) {
    return imagePath;
  }
  return `${imagePath}?v=${timestamp}`;
}

export function validateAvatarFile(file: File): string | null {
  if (
    !AVATAR_CONTENT_TYPES.includes(
      file.type as (typeof AVATAR_CONTENT_TYPES)[number]
    )
  ) {
    return "Upload a JPEG, PNG, or WebP image.";
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return "Image must be 2 MB or smaller.";
  }
  return null;
}

export function validateScreenshotFile(file: File): string | null {
  if (
    !SCREENSHOT_CONTENT_TYPES.includes(
      file.type as (typeof SCREENSHOT_CONTENT_TYPES)[number]
    )
  ) {
    return "Upload a JPEG, PNG, WebP, or GIF image.";
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return "Image must be 2 MB or smaller.";
  }
  return null;
}
