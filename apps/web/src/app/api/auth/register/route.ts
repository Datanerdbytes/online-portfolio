import { getNeonAuth } from "@/lib/auth/server";
import {
  authErrorResponse,
  authJsonResponse,
  boundedAuthJson,
  validateMutation,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const error = validateMutation(request);
  if (error) return authErrorResponse(error.status, error.detail);
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return authErrorResponse(400, "Invalid request");
  let body: unknown;
  try {
    body = await boundedAuthJson(request);
  } catch {
    return authErrorResponse(400, "Invalid request");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return authErrorResponse(400, "Invalid request");
  const fields = body as Record<string, unknown>;
  if (
    Object.keys(fields).sort().join(",") !== "email,name,password" ||
    typeof fields.email !== "string" ||
    fields.email.length > 254 ||
    typeof fields.name !== "string" ||
    !fields.name.trim() ||
    fields.name.length > 200 ||
    typeof fields.password !== "string" || // pragma: allowlist secret (type check)
    fields.password.length < 8 ||
    new TextEncoder().encode(fields.password).length > 1024
  ) {
    return authErrorResponse(400, "Invalid registration details");
  }
  try {
    const result = await getNeonAuth().signUp.email({
      email: fields.email.trim().toLowerCase(),
      name: fields.name.trim(),
      password: fields.password,
    });
    if (result.error && result.error.status >= 500)
      return authErrorResponse(503, "Authentication service unavailable");
    if (result.error)
      return authErrorResponse(
        result.error.status === 429 ? 429 : 400,
        "Registration could not be completed. Check your details or sign in if already registered."
      );
    return authJsonResponse({ registered: true });
  } catch {
    return authErrorResponse(503, "Authentication service unavailable");
  }
}
