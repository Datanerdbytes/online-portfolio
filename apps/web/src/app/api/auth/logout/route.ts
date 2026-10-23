import { getNeonAuth } from "@/lib/auth/server";
import { authErrorResponse, validateMutation } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const error = validateMutation(request);
  if (error) return authErrorResponse(error.status, error.detail);
  try {
    const result = await getNeonAuth().signOut();
    if (result.error)
      return authErrorResponse(503, "Sign-out unavailable. Please retry.");
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return authErrorResponse(503, "Sign-out unavailable. Please retry.");
  }
}
