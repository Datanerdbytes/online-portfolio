import {
  adminCookieOptions, authErrorResponse, authJsonResponse, fetchBackend,
  isTokenResponse, validateMutation, validLoginBody,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const error = validateMutation(request);
  if (error) return authErrorResponse(error.status, error.detail);
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") return authErrorResponse(400, "Invalid request");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return authErrorResponse(400, "Invalid request");
  }
  if (!validLoginBody(body)) return authErrorResponse(400, "Invalid request");
  const result = await fetchBackend("/api/v1/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: body.username, password: body.password }),
  });
  if (result.error) {
    return authErrorResponse(result.error.status, result.error.detail,
      result.error.status === 429 ? { "Retry-After": result.retryAfter ?? "300" } : undefined);
  }
  if (!isTokenResponse(result.body)) return authErrorResponse(502, "Authentication service unavailable");
  const { access_token, owner_id, expires_at } = result.body;
  // Validate expiry again at cookie-write time; an elapsed response cannot create a session.
  try {
    const options = adminCookieOptions(expires_at);
    const response = authJsonResponse({ owner_id, authenticated: true, expires_at });
    response.cookies.set({ ...options, value: access_token });
    return response;
  } catch {
    return authErrorResponse(502, "Authentication service unavailable");
  }
}
