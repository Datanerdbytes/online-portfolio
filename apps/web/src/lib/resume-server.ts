import "server-only";
import { cache } from "react";
import { API_BASE_URL, type ApiResume } from "@/lib/api";

export const getPublicResumeState = cache(async () => {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/public/resume`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { status: "unavailable" as const };
  }
  if (response.status === 404) return { status: "missing" as const };
  if (!response.ok) return { status: "unavailable" as const };
  try {
    return {
      status: "ok" as const,
      data: (await response.json()) as ApiResume,
    };
  } catch {
    return { status: "unavailable" as const };
  }
});
export const getResumeCached = cache(async () => {
  const result = await getPublicResumeState();
  return result.status === "ok" ? result.data : null;
});
