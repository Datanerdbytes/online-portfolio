import { NextResponse } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/health`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-store" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return NextResponse.json({ status: "unavailable" }, { status: 502 });
    }
    const data = (await response.json()) as { status: string };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 502 });
  }
}
