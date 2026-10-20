import { NextResponse } from "next/server";
import { fetchProjects } from "@/lib/api";
import { handleProjectMutation, isProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchProjects();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  return handleProjectMutation(request, {
    method: "POST",
    path: "/api/v1/projects",
    successStatus: 201,
    allowedFields: [
      "slug", "title", "summary", "technologies", "repository_url", "demo_url", "display_order",
    ],
    requiredFields: ["slug", "title", "summary", "technologies"],
    forbidReadOnly: true,
    validateSuccess: isProject,
  });
}
