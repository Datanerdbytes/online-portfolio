/**
 * DELETE /api/portfolio/data — proxy for the destructive "delete all
 * portfolio data" action. Validates the shared admin CSRF headers and
 * forwards the bearer token to the FastAPI backend. The upstream answers
 * 204 with an empty body, so this route never parses JSON.
 */

import { NextResponse } from "next/server";
import {
  authErrorResponse,
  readAdminToken,
  validateMutation,
} from "@/lib/auth";
import { API_BASE_URL } from "@/lib/api";

export const dynamic = "force-dynamic";

const UPSTREAM_TIMEOUT_MS = 10000;

export async function DELETE(request: Request) {
  const rejected = validateMutation(request);
  if (rejected) return authErrorResponse(rejected.status, rejected.detail);

  const token = await readAdminToken();
  if (!token) return authErrorResponse(401, "Not authenticated");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${API_BASE_URL}/api/v1/portfolio/data`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (upstream.status !== 204) {
      const status = upstream.status;
      if (status === 401 || status === 403) {
        return authErrorResponse(
          status,
          "Your session could not be verified. Sign in again."
        );
      }
      if (status === 503) {
        return authErrorResponse(
          503,
          "Administration is unavailable. Please try again."
        );
      }
      return authErrorResponse(
        502,
        "Workspace data could not be deleted. Please try again."
      );
    }
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return authErrorResponse(
      502,
      "Workspace data could not be deleted. Please try again."
    );
  } finally {
    clearTimeout(timeout);
  }
}
