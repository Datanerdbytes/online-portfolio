import { PUT as replaceProject, PATCH as patchProject, DELETE as deleteProject } from "@/app/api/projects/[slug]/route";
import { handleProjectMutation, isReorderRequest, isUpdatedBody } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleProjectMutation(request, {
    method: "POST",
    path: "/api/v1/projects/reorder",
    successStatus: 200,
    allowedFields: ["orders"],
    requiredFields: ["orders"],
    validateBody: isReorderRequest,
    validateSuccess: (value, body) => isUpdatedBody(value) && isReorderRequest(body) && value.updated === body.orders.length,
    successBody: (value) => ({ updated: (value as { updated: number }).updated }),
  });
}

// The static reorder route also represents a project whose legal slug is "reorder".
const projectParams = () => ({ params: Promise.resolve({ slug: "reorder" }) });
export async function PUT(request: Request) { return replaceProject(request, projectParams()); }
export async function PATCH(request: Request) { return patchProject(request, projectParams()); }
export async function DELETE(request: Request) { return deleteProject(request, projectParams()); }
