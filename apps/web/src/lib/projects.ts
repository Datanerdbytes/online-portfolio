import "server-only";

import { NextResponse } from "next/server";

import {
  isProject,
  isSlug,
  isStrictOrder,
  projectResponse,
} from "@/lib/project-management";
export { isProject, isSlug } from "@/lib/project-management";
import {
  authErrorResponse,
  boundedAuthJson,
  RequestBodyTooLarge,
  readAdminToken,
  validateMutation,
} from "@/lib/auth";

const REQUEST_TIMEOUT_MS = 8000;

export type ReorderEntry = {
  slug: string;
  display_order: number;
};

export type ReorderRequest = {
  orders: ReorderEntry[];
};

export type ReorderResponse = {
  updated: number;
};

const MAX_ORDERS = 100;

const READ_ONLY_FIELDS = ["id", "is_sample"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isReorderRequest(value: unknown): value is ReorderRequest {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== 1 ||
    !Array.isArray(value.orders)
  )
    return false;
  const { orders } = value;
  if (orders.length < 1 || orders.length > MAX_ORDERS) return false;
  const slugs = new Set<string>();
  for (const entry of orders) {
    if (
      !isPlainObject(entry) ||
      Object.keys(entry).length !== 2 ||
      !isSlug(entry.slug) ||
      !isStrictOrder(entry.display_order)
    ) {
      return false;
    }
    if (slugs.has(entry.slug)) return false;
    slugs.add(entry.slug);
  }
  return true;
}

export function isUpdatedBody(value: unknown): value is ReorderResponse {
  return (
    isPlainObject(value) &&
    typeof value.updated === "number" &&
    Number.isInteger(value.updated) &&
    value.updated >= 1 &&
    value.updated <= MAX_ORDERS
  );
}

type BackendResult =
  | { body: unknown; error: null }
  | {
      body: null;
      error: { status: number; detail: string };
      retryAfter?: string;
    };

export async function fetchProjectBackend(
  path: string,
  init: RequestInit = {},
  {
    parseJson = true,
    expectedStatus = 200,
  }: { parseJson?: boolean; expectedStatus?: number } = {}
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
      const detail: Record<number, string> = {
        400: "Invalid request",
        401: "Not authenticated",
        403: "Not authorized",
        404: "Project not found",
        409: "Project already exists",
        429: "Too many requests",
        503: "Administration unavailable",
      };
      const status = response.status;
      if (!(status in detail)) {
        return {
          body: null,
          error: { status: 502, detail: "Projects service unavailable" },
        };
      }
      const retry = response.headers.get("retry-after");
      return {
        body: null,
        error: { status, detail: detail[status] },
        retryAfter: retry && /^\d{1,3}$/.test(retry) ? retry : undefined,
      };
    }
    if (response.status !== expectedStatus) {
      return {
        body: null,
        error: { status: 502, detail: "Projects service unavailable" },
      };
    }
    return { body: parseJson ? await response.json() : null, error: null };
  } catch {
    return {
      body: null,
      error: { status: 502, detail: "Projects service unavailable" },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export type ProjectRouteOptions = {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  slug?: string;
  successStatus: number;
  allowedFields?: readonly string[];
  requiredFields?: readonly string[];
  requireNonEmptyBody?: boolean;
  forbidReadOnly?: boolean;
  validateBody?: (value: unknown) => boolean;
  validateSuccess?: (value: unknown, body: unknown) => boolean;
  successBody?: (value: unknown) => unknown;
};

function readOnlyFieldsFor(
  method: "POST" | "PUT" | "PATCH"
): readonly string[] {
  return [
    ...READ_ONLY_FIELDS,
    ...(method === "PUT" || method === "PATCH" ? ["slug"] : []),
  ];
}

export async function handleProjectMutation(
  request: Request,
  options: ProjectRouteOptions
): Promise<NextResponse> {
  const csrf = validateMutation(request);
  if (csrf) return authErrorResponse(csrf.status, csrf.detail);

  if (options.method !== "DELETE") {
    const mediaType = request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (mediaType !== "application/json") {
      return authErrorResponse(400, "Invalid request");
    }
  }

  const token = await readAdminToken();
  if (!token) return authErrorResponse(401, "Not authenticated");
  if (options.slug !== undefined && !isSlug(options.slug))
    return authErrorResponse(400, "Invalid request");

  let body: unknown = null;
  if (options.method !== "DELETE") {
    try {
      body = await boundedAuthJson(request, 512 * 1024);
    } catch (error) {
      if (error instanceof RequestBodyTooLarge) {
        return authErrorResponse(413, "Request body too large.");
      }
      return authErrorResponse(400, "Invalid request");
    }
    if (!isPlainObject(body)) return authErrorResponse(400, "Invalid request");
    if (options.requiredFields) {
      for (const field of options.requiredFields) {
        if (!(field in body)) return authErrorResponse(400, "Invalid request");
      }
    }
    if (options.allowedFields) {
      for (const field of Object.keys(body)) {
        if (!options.allowedFields.includes(field))
          return authErrorResponse(400, "Invalid request");
      }
    }
    if (options.requireNonEmptyBody && Object.keys(body).length === 0) {
      return authErrorResponse(400, "Invalid request");
    }
    if (options.forbidReadOnly) {
      for (const field of readOnlyFieldsFor(options.method)) {
        if (field in body) return authErrorResponse(400, "Invalid request");
      }
    }
    if (options.validateBody && !options.validateBody(body)) {
      return authErrorResponse(400, "Invalid request");
    }
  }

  const result = await fetchProjectBackend(
    options.path,
    {
      method: options.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body !== null ? { body: JSON.stringify(body) } : {}),
    },
    {
      parseJson: options.method !== "DELETE",
      expectedStatus: options.successStatus,
    }
  );

  if (result.error) {
    const headers: Record<string, string> = {};
    if (result.error.status === 429 && result.retryAfter) {
      headers["Retry-After"] = result.retryAfter;
    }
    return authErrorResponse(result.error.status, result.error.detail, headers);
  }
  if (options.validateSuccess && !options.validateSuccess(result.body, body)) {
    return authErrorResponse(502, "Projects service unavailable");
  }
  const out = options.successBody
    ? options.successBody(result.body)
    : isProject(result.body)
      ? projectResponse(result.body)
      : result.body;
  if (options.method === "DELETE") {
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json(out, {
    status: options.successStatus,
    headers: { "Cache-Control": "no-store" },
  });
}
