import { type NextRequest, NextResponse } from "next/server";
import { validateMutation, readAdminToken } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/api";
import { AVATAR_UPLOAD_MAX_BYTES } from "@/lib/avatar";

const UPSTREAM_TIMEOUT_MS = 10000;

export function createProfileImageHandlers(
  apiPath: string,
  imageLabel: string
) {
  async function GET(req: NextRequest) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const headers = new Headers();
      const ifNoneMatch = req.headers.get("if-none-match");
      if (ifNoneMatch) headers.set("if-none-match", ifNoneMatch);

      const upstream = await fetch(`${API_BASE_URL}${apiPath}`, {
        method: "GET",
        headers,
        cache: "no-store",
        signal: controller.signal,
      });

      if (upstream.status === 304) {
        const responseHeaders = new Headers();
        const etag = upstream.headers.get("etag");
        const cacheControl = upstream.headers.get("cache-control");
        if (etag) responseHeaders.set("etag", etag);
        if (cacheControl) responseHeaders.set("cache-control", cacheControl);
        return new NextResponse(null, {
          status: 304,
          headers: responseHeaders,
        });
      }

      if (upstream.status === 404 || upstream.status === 503) {
        const fallback =
          upstream.status === 404
            ? `${imageLabel} not found`
            : "Image storage unavailable";
        const body = await upstream.text();
        try {
          return NextResponse.json(JSON.parse(body), {
            status: upstream.status,
            headers: { "Cache-Control": "no-store" },
          });
        } catch {
          return NextResponse.json(
            { detail: fallback },
            {
              status: upstream.status,
              headers: { "Cache-Control": "no-store" },
            }
          );
        }
      }

      const responseHeaders = new Headers();
      for (const name of [
        "content-type",
        "content-length",
        "etag",
        "cache-control",
      ]) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }
      return new NextResponse(await upstream.arrayBuffer(), {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch {
      return NextResponse.json(
        { detail: `${imageLabel} service unavailable` },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async function mutate(req: NextRequest) {
    const mutationError = validateMutation(req);
    if (mutationError) {
      return NextResponse.json(
        { detail: mutationError.detail },
        {
          status: mutationError.status,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const token = await readAdminToken();
    if (!token) {
      return NextResponse.json(
        { detail: "Not authenticated" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const method = req.method;
      const headers = new Headers({
        Authorization: `Bearer ${token}`,
        "x-requested-with": "online-resume-admin",
      });
      let body: BodyInit | undefined;

      if (method === "PUT") {
        const contentType = req.headers.get("content-type");
        if (contentType) headers.set("content-type", contentType);

        const contentLength = req.headers.get("content-length");
        if (contentLength) {
          const length = Number(contentLength);
          if (!Number.isNaN(length) && length > AVATAR_UPLOAD_MAX_BYTES) {
            return tooLargeResponse(imageLabel);
          }
        }
        const arrayBuffer = await req.arrayBuffer();
        if (arrayBuffer.byteLength > AVATAR_UPLOAD_MAX_BYTES) {
          return tooLargeResponse(imageLabel);
        }
        body = arrayBuffer;
      }

      const upstream = await fetch(`${API_BASE_URL}${apiPath}`, {
        method,
        headers,
        body,
        signal: controller.signal,
        cache: "no-store",
      });

      if (method === "DELETE") {
        if (upstream.status === 204) {
          return new NextResponse(null, {
            status: 204,
            headers: { "Cache-Control": "no-store" },
          });
        }
        return jsonOrFallback(upstream, `${imageLabel} removal failed`);
      }

      return jsonOrFallback(upstream, `${imageLabel} upload failed`);
    } catch {
      return NextResponse.json(
        { detail: `${imageLabel} service unavailable` },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return { GET, PUT: mutate, DELETE: mutate };
}

function tooLargeResponse(imageLabel: string) {
  return NextResponse.json(
    { detail: `${imageLabel} too large` },
    { status: 413, headers: { "Cache-Control": "no-store" } }
  );
}

async function jsonOrFallback(upstream: Response, fallback: string) {
  const responseBody = await upstream.text();
  try {
    return NextResponse.json(JSON.parse(responseBody), {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return new NextResponse(
      responseBody || JSON.stringify({ detail: fallback }),
      {
        status: upstream.status,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
        },
      }
    );
  }
}
