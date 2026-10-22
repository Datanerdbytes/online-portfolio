/**
 * /api/resume/[...path] — proxy for authenticated resume mutations.
 *
 * Forwards PATCH requests from the admin UI to the FastAPI backend,
 * injecting the bearer token from the session cookie. Validates the
 * same CSRF headers the project-management routes use.
 */

import { type NextRequest, NextResponse } from "next/server";
import { validateMutation, readAdminToken } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/api";

const UPSTREAM_TIMEOUT_MS = 10000;

async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const mutationError = validateMutation(req);
  if (mutationError) {
    return NextResponse.json(
      { detail: mutationError.detail },
      { status: mutationError.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  const token = await readAdminToken();
  if (!token) {
    return NextResponse.json(
      { detail: "Not authenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { path } = await params;
  const upstreamPath = `/api/v1/resume/${path.join("/")}`;
  const idempotencyKey =
    req.method === "POST" ? req.headers.get("idempotency-key") : null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const body =
      req.method === "GET" || req.method === "HEAD" || req.method === "DELETE"
        ? undefined
        : await req.text();
    const upstream = await fetch(`${API_BASE_URL}${upstreamPath}`, {
      method: req.method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey
          ? { "Idempotency-Key": idempotencyKey }
          : {}),
        Authorization: `Bearer ${token}`,
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    const responseBody = await upstream.text();
    return new NextResponse(upstream.status === 204 ? null : responseBody, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "Resume service unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const GET = proxy;
export const PATCH = proxy;
export const POST = proxy;
export const DELETE = proxy;
