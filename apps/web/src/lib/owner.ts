/**
 * Owner id for AI writing requests, resolved from the import context the
 * wizard already has when available. Manual editors that render without an
 * import context fetch it lazily (and cache the success) so the assistant
 * works in both editor modes.
 */
let cachedOwnerId: string | null = null;

export async function fetchOwnerId(): Promise<string | null> {
  if (cachedOwnerId) return cachedOwnerId;
  try {
    const response = await fetch("/api/resume-import/context", {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      status?: { owner_id?: unknown };
    } | null;
    const owner =
      typeof data?.status?.owner_id === "string" ? data.status.owner_id : null;
    if (owner) cachedOwnerId = owner;
    return owner;
  } catch {
    return null;
  }
}
