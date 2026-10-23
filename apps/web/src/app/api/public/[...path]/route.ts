import { API_BASE_URL } from "@/lib/api";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  if (
    !/^(users\/[a-zA-Z0-9-]{1,128}\/)?(resume|projects|resume\/profile\/(avatar|banner)|projects\/[a-z0-9-]+(\/screenshot)?)$/.test(
      path.join("/")
    )
  )
    return new Response(null, { status: 404 });
  try {
    const upstream = await fetch(
      `${API_BASE_URL}/api/v1/public/${path.map(encodeURIComponent).join("/")}`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "Portfolio unavailable" },
      { status: 503 }
    );
  }
}
