import {
  authErrorResponse,
  authJsonResponse,
  fetchBackend,
  readAdminToken,
} from "@/lib/auth";
import { isPortfolioStatus } from "@/lib/portfolio";

export const dynamic = "force-dynamic";
export async function GET() {
  const token = await readAdminToken();
  if (!token) return authErrorResponse(401, "Not authenticated");
  const result = await fetchBackend("/api/v1/portfolio", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (result.error)
    return authErrorResponse(result.error.status, result.error.detail);
  if (!isPortfolioStatus(result.body))
    return authErrorResponse(502, "Workspace unavailable");
  return authJsonResponse(result.body);
}
