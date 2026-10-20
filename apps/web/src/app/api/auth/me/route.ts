import {
  adminConfigurationError, readAdminToken, verifyIdentityViaBackend, authErrorResponse, authJsonResponse,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const error = adminConfigurationError();
  if (error) return authErrorResponse(error.status, error.detail);
  const token = await readAdminToken();
  if (!token) return authErrorResponse(401, "Not authenticated");
  const result = await verifyIdentityViaBackend(token);
  if (result.error) return authErrorResponse(result.error.status, result.error.detail);
  return authJsonResponse(result.identity);
}
