import { handleProjectMutation, isProject } from "@/lib/projects";

const UPDATE_FIELDS = [
  "title", "summary", "technologies", "repository_url", "demo_url", "display_order",
] as const;

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  return handleProjectMutation(request, {
    method: "PUT",
    path: `/api/v1/projects/${encodeURIComponent(slug)}`,
    slug,
    successStatus: 200,
    allowedFields: UPDATE_FIELDS,
    requiredFields: UPDATE_FIELDS,
    forbidReadOnly: true,
    validateSuccess: isProject,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  return handleProjectMutation(request, {
    method: "PATCH",
    path: `/api/v1/projects/${encodeURIComponent(slug)}`,
    slug,
    successStatus: 200,
    allowedFields: UPDATE_FIELDS,
    requireNonEmptyBody: true,
    forbidReadOnly: true,
    validateSuccess: isProject,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  return handleProjectMutation(request, {
    method: "DELETE",
    path: `/api/v1/projects/${encodeURIComponent(slug)}`,
    slug,
    successStatus: 204,
  });
}
