import { NextResponse, type NextRequest } from "next/server";
import { createProfileImageHandlers } from "@/lib/profile-image-proxy";
import { isSlug } from "@/lib/project-management";

type RouteContext = { params: Promise<{ slug: string }> };

async function handlers(context: RouteContext) {
  const { slug } = await context.params;
  if (!isSlug(slug)) {
    return null;
  }
  return createProfileImageHandlers(
    `/api/v1/projects/${encodeURIComponent(slug)}/screenshot`,
    "Screenshot"
  );
}

function invalidSlugResponse() {
  return NextResponse.json(
    { detail: "Project not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  const route = await handlers(context);
  return route ? route.GET(request) : invalidSlugResponse();
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const route = await handlers(context);
  return route ? route.PUT(request) : invalidSlugResponse();
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const route = await handlers(context);
  return route ? route.DELETE(request) : invalidSlugResponse();
}
