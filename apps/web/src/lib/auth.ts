import "server-only";

import { getNeonAuth } from "@/lib/auth/server";
import { NextResponse } from "next/server";

const REQUEST_TIMEOUT_MS = 8000;
const CUSTOM_HEADER_VALUE = "online-resume-admin";

export type AdminIdentity = {
  owner_id: string;
  authenticated: true;
  expires_at: number;
};
export type AuthError = { status: number; detail: string };
export type IdentityResult =
  | { identity: AdminIdentity; error: null }
  | { identity: null; error: AuthError };

function canonicalOrigin(): string | null {
  try {
    const raw = process.env.ADMIN_WEB_ORIGIN;
    if (!raw) return null;
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== raw)
      return null;
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
      return null;
    return raw;
  } catch {
    return null;
  }
}

export function adminConfigurationError(): AuthError | null {
  const base = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  try {
    const url = new URL(base || "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    if (!secret || secret.length < 32 || !canonicalOrigin()) throw new Error();
    return null;
  } catch {
    return { status: 503, detail: "Neon authentication is not configured" };
  }
}

export function validateMutation(request: Request): AuthError | null {
  const configurationError = adminConfigurationError();
  if (configurationError) return configurationError;
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if (
    origin !== canonicalOrigin() ||
    request.headers.get("x-requested-with") !== CUSTOM_HEADER_VALUE ||
    (site !== null && site !== "same-origin")
  ) {
    return { status: 403, detail: "Request not permitted" };
  }
  return null;
}

export function validExpiration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > Date.now() / 1000
  );
}

export async function readAdminToken(): Promise<string | null> {
  if (adminConfigurationError()) return null;
  try {
    // This is the provider JWT, NOT getSession().data.session.token (opaque).
    // Fetching it checks the live managed session instead of trusting a cached identity.
    const result = await getNeonAuth().token();
    if (result.error || !result.data?.token) return null;
    return result.data.token;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isIdentity(value: unknown): value is AdminIdentity {
  return (
    isRecord(value) &&
    typeof value.owner_id === "string" &&
    value.owner_id.trim().length > 0 &&
    value.authenticated === true &&
    validExpiration(value.expires_at)
  );
}

type BackendResult =
  | { body: unknown; error: null }
  | { body: null; error: AuthError; retryAfter?: string };

export async function fetchBackend(
  path: string,
  init: RequestInit = {}
): Promise<BackendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const base = process.env.API_BASE_URL || "http://localhost:8000";
    const response = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      if ([400, 401, 403, 404, 409, 429, 503].includes(response.status)) {
        const detail: Record<number, string> = {
          400: "Invalid request",
          401: "Not authenticated",
          403: "Not authorized",
          404: "Not found",
          409: "Your draft changed. Refresh the preview and try again.",
          429: "Too many login attempts",
          503: "Administration unavailable",
        };
        const retry = response.headers.get("retry-after");
        return {
          body: null,
          error: { status: response.status, detail: detail[response.status] },
          retryAfter: retry && /^\d{1,3}$/.test(retry) ? retry : "300",
        };
      }
      return {
        body: null,
        error: { status: 502, detail: "Authentication service unavailable" },
      };
    }
    // Deadline stays armed through JSON body consumption, not just response headers.
    return { body: await response.json(), error: null };
  } catch {
    return {
      body: null,
      error: { status: 502, detail: "Authentication service unavailable" },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyIdentityViaBackend(
  token: string
): Promise<IdentityResult> {
  const configError = adminConfigurationError();
  if (configError) return { identity: null, error: configError };
  const result = await fetchBackend("/api/v1/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (result.error) return { identity: null, error: result.error };
  if (!isIdentity(result.body)) {
    return {
      identity: null,
      error: { status: 502, detail: "Authentication service unavailable" },
    };
  }
  return {
    identity: {
      owner_id: result.body.owner_id,
      authenticated: true,
      expires_at: result.body.expires_at,
    },
    error: null,
  };
}

export function validLoginBody(
  body: unknown
): body is { username: string; password: string } {
  return (
    isRecord(body) &&
    Object.keys(body).length === 2 &&
    typeof body.username === "string" &&
    [...body.username].length >= 1 &&
    [...body.username].length <= 200 &&
    typeof body.password === "string" &&
    body.password.length > 0 &&
    new TextEncoder().encode(body.password).length <= 1024
  );
}

export function authErrorResponse(
  status: number,
  detail: string,
  headers?: Record<string, string>
) {
  return NextResponse.json(
    { detail },
    {
      status,
      headers: { "Cache-Control": "no-store", ...headers },
    }
  );
}

export function authJsonResponse(body: unknown) {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

export class RequestBodyTooLarge extends Error {}

export async function boundedRequestBytes(
  request: Request,
  maxBytes: number
): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new RequestBodyTooLarge();
    }
    parts.push(value);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    buffer.set(part, offset);
    offset += part.byteLength;
  }
  return buffer;
}

export async function boundedRequestText(
  request: Request,
  maxBytes: number
): Promise<string> {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    await boundedRequestBytes(request, maxBytes)
  );
}

export async function boundedAuthJson(
  request: Request,
  maxBytes = 8192
): Promise<unknown> {
  return JSON.parse(await boundedRequestText(request, maxBytes));
}
