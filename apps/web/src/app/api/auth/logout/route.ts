import { NextResponse } from "next/server";
import { validateMutation, authErrorResponse, clearAdminCookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const error = validateMutation(request);
  if (error) return authErrorResponse(error.status, error.detail);
  const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  response.cookies.set({ ...clearAdminCookieOptions(), value: "" });
  return response;
}
