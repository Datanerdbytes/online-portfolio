import { getNeonAuth } from "@/lib/auth/server";
import {
  adminConfigurationError,
  authErrorResponse,
  validateMutation,
} from "@/lib/auth";
import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const error = adminConfigurationError();
  if (error) return authErrorResponse(error.status, error.detail);
  try {
    const response = await getNeonAuth().handler().GET(request, context);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return authErrorResponse(503, "Authentication service unavailable");
  }
}

export async function POST(request: NextRequest, context: Context) {
  const error = validateMutation(request);
  if (error) return authErrorResponse(error.status, error.detail);
  try {
    const response = await getNeonAuth().handler().POST(request, context);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return authErrorResponse(503, "Authentication service unavailable");
  }
}
