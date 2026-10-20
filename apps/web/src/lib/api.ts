export const API_BASE_URL =
  process.env.API_BASE_URL || "http://localhost:8000";

export type HealthStatus = { status: string } | null;

const HEALTH_TIMEOUT_MS = 5000;

export async function fetchHealth(): Promise<HealthStatus> {
  let controller: AbortController | null = null;
  try {
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), HEALTH_TIMEOUT_MS);
    const response = await fetch(`${API_BASE_URL}/api/v1/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as { status: string };
  } catch {
    return null;
  } finally {
    controller = null;
  }
}
