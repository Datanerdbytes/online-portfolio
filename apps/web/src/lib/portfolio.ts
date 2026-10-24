export type PortfolioStatus = {
  owner_id: string;
  is_published: boolean;
  has_unpublished_changes: boolean;
  revision: number;
  published_at: string | null;
  profile_complete: boolean;
  has_work: boolean;
};

export function isPortfolioStatus(value: unknown): value is PortfolioStatus {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.owner_id === "string" &&
    typeof row.is_published === "boolean" &&
    typeof row.has_unpublished_changes === "boolean" &&
    typeof row.revision === "number" &&
    Number.isSafeInteger(row.revision) &&
    row.revision >= 0 &&
    (row.published_at === null || typeof row.published_at === "string") &&
    typeof row.profile_complete === "boolean" &&
    typeof row.has_work === "boolean"
  );
}
