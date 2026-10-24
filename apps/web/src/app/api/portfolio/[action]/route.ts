import {
  authErrorResponse,
  authJsonResponse,
  boundedAuthJson,
  fetchBackend,
  readAdminToken,
  validateMutation,
} from "@/lib/auth";
import { isPortfolioStatus } from "@/lib/portfolio";

export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> }
) {
  const rejected = validateMutation(request);
  if (rejected) return authErrorResponse(rejected.status, rejected.detail);
  const { action } = await context.params;
  if (!["publish", "unpublish"].includes(action))
    return authErrorResponse(404, "Not found");
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return authErrorResponse(400, "Invalid request");
  let body: unknown;
  try {
    body = await boundedAuthJson(request);
  } catch {
    return authErrorResponse(400, "Invalid request");
  }
  if (
    !body ||
    typeof body !== "object" ||
    Object.keys(body).join() !== "revision" ||
    !("revision" in body) ||
    typeof body.revision !== "number" ||
    !Number.isSafeInteger(body.revision) ||
    body.revision < 0
  )
    return authErrorResponse(400, "Invalid request");
  const token = await readAdminToken();
  if (!token) return authErrorResponse(401, "Not authenticated");
  const result = await fetchBackend(`/api/v1/portfolio/${action}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (result.error)
    return authErrorResponse(result.error.status, result.error.detail);
  if (!isPortfolioStatus(result.body))
    return authErrorResponse(502, "Workspace unavailable");
  return authJsonResponse(result.body);
}
