import { authErrorResponse, readAdminToken } from "@/lib/auth";
import { NextResponse } from "next/server";
import { fetchProjects } from "@/lib/api";
import { handleProjectMutation, isProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = await readAdminToken();
  if (!token) return authErrorResponse(401, "Not authenticated");
  try {
    const data = await fetchProjects(token);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    // Record only an error class; never log headers, tokens or provider payloads.
    console.warn(
      "Project list request failed",
      error instanceof Error ? error.name : "UnknownError"
    );
    return NextResponse.json(
      { status: "unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: Request) {
  return handleProjectMutation(request, {
    method: "POST",
    path: "/api/v1/projects",
    successStatus: 201,
    allowedFields: [
      "slug",
      "title",
      "summary",
      "technologies",
      "repository_url",
      "demo_url",
      "display_order",
    ],
    requiredFields: ["slug", "title", "summary", "technologies"],
    forbidReadOnly: true,
    validateSuccess: isProject,
  });
}
