import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";

// Lazy initialization keeps public pages/builds available without auth credentials.
export function getNeonAuth() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret || secret.length < 32)
    throw new Error("Neon Auth is not configured");
  return createNeonAuth({
    baseUrl,
    cookies: { secret, sessionDataTtl: 60, sameSite: "lax" },
    // Avoid logging provider response bodies, credentials or cookies.
    logger: {
      error: () => console.error("Neon authentication request failed"),
      warn: () => console.warn("Neon authentication service unavailable"),
    },
  });
}
