import { getNeonAuth } from "@/lib/auth/server";
import {
  authErrorResponse,
  authJsonResponse,
  boundedAuthJson,
  validateMutation,
  validLoginBody,
  verifyIdentityViaBackend,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const error = validateMutation(request);
  if (error) return authErrorResponse(error.status, error.detail);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return authErrorResponse(400, "Invalid request");
  let body: unknown;
  try {
    body = await boundedAuthJson(request);
  } catch {
    return authErrorResponse(400, "Invalid request");
  }
  if (!validLoginBody(body)) return authErrorResponse(400, "Invalid request");
  try {
    const session = await getNeonAuth().token();
    if (session.error) {
      if (![401, 403].includes(session.error.status))
        return authErrorResponse(503, "Authentication service unavailable");
    } else if (session.data?.token) {
      const identity = await verifyIdentityViaBackend(session.data.token);
      if (identity.identity) return authJsonResponse({ authenticated: true });
      if (![401, 403].includes(identity.error.status))
        return authErrorResponse(503, "Authentication service unavailable");
    }

    const result = await getNeonAuth().signIn.email({
      email: body.username.trim().toLowerCase(),
      password: body.password,
    });
    if (result.error) {
      const status = result.error.status;
      if (status >= 500)
        return authErrorResponse(503, "Authentication service unavailable");
      return authErrorResponse(
        status === 429 ? 429 : status === 403 ? 403 : 401,
        status === 403
          ? "Verify your email before signing in"
          : "Sign-in failed"
      );
    }
    return authJsonResponse({ authenticated: true });
  } catch {
    return authErrorResponse(503, "Authentication service unavailable");
  }
}
