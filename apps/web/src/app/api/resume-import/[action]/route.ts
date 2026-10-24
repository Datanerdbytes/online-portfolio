import {
  authErrorResponse,
  readAdminToken,
  validateMutation,
} from "@/lib/auth";
import { IMPORT_MAX_BYTES } from "@/lib/resume-import";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function bounded(request: Request, limit: number) {
  const length = request.headers.get("content-length");
  if (length && Number(length) > limit) throw new Error("large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}
async function proxy(request: Request, action: string) {
  if (request.method === "POST") {
    const error = validateMutation(request);
    if (error) return authErrorResponse(error.status, error.detail);
  }
  const token = await readAdminToken();
  if (!token)
    return authErrorResponse(401, "Sign in again to continue importing.");
  const upload = action === "analyze" || action === "read";
  const type = request.headers.get("content-type") ?? "";
  if (
    request.method === "POST" &&
    !(upload
      ? /^multipart\/form-data;.*boundary=/i.test(type)
      : type.split(";")[0] === "application/json")
  )
    return authErrorResponse(400, "Invalid import request.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100000);
  try {
    const body =
      request.method === "POST"
        ? await bounded(request, upload ? IMPORT_MAX_BYTES + 65536 : 512000)
        : undefined;
    const response = await fetch(
      `${process.env.API_BASE_URL || "http://localhost:8000"}/api/v1/resume-import/${action}`,
      {
        method: request.method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": type } : {}),
        },
        body,
        signal: controller.signal,
        cache: "no-store",
      }
    );
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (!response.ok) {
      clearTimeout(timer);
      const errors: Record<number, string> = {
        400: "Check the file, consent, and selected fields.",
        401: "Sign in again to continue.",
        403: "Request not permitted.",
        404: "An entry no longer exists. Refresh existing values.",
        409: "Your draft changed or this save key was already used. Refresh existing values and reconfirm your choices.",
        413: "Choose a file no larger than 3 MiB.",
        429: "Import limit reached. Retry later or use the manual editor.",
        503: "Import is unavailable. Your manual editor is still available.",
      };
      if (action === "write") {
        errors[429] =
          "AI writing limit reached or another request is still running. Retry later; your text is unchanged.";
        errors[503] =
          "AI writing is temporarily unavailable. Your text is unchanged; retry or write manually.";
        errors[409] =
          "Your signed-in account changed. Refresh your workspace before using AI writing.";
      }
      if (action === "write" && response.status === 503) {
        const safeWritingErrors = new Set([
          "AI writing is temporarily unavailable. Your text is unchanged.",
          "The AI draft was too large. Your text is unchanged.",
          "The AI draft was incomplete. Your text is unchanged.",
          "The AI draft did not fit this field. Your text is unchanged.",
          "The AI draft included other sections. Retry for only the requested field.",
          "The AI draft added an unsupported number. Retry or write manually.",
          "AI writing could not finish. Your text is unchanged; retry later.",
        ]);
        try {
          const payload = await response.json();
          if (safeWritingErrors.has(payload.detail))
            return authErrorResponse(503, payload.detail);
        } catch {
          /* Preserve only known content-free errors. */
        }
      }
      if (action === "read" && response.status === 400) {
        const safeMessages = new Set([
          "Choose a PDF or DOCX file no larger than 3 MiB.",
          "Password-protected PDFs are unsupported. Export an unlocked copy.",
          "Choose a PDF with 1 to 10 pages.",
          "This PDF page is too complex. Export a simpler document.",
          "A page has no readable text. Scanned or mixed PDFs need a text-based export.",
          "This Word document is too complex or encrypted. Export a simpler DOCX.",
          "The file content does not match a supported PDF or DOCX.",
          "The document exceeds 50,000 characters. Upload a shorter resume.",
          "No readable resume text was found. Export a text-based PDF or DOCX.",
          "We could not read this document. Export a new PDF or DOCX and retry.",
          "Document reading timed out. Export a simpler resume and retry.",
          "Document reading failed. Export a simpler resume and retry.",
        ]);
        try {
          const payload = await response.json();
          if (safeMessages.has(payload.detail))
            return authErrorResponse(400, payload.detail);
        } catch {
          /* Keep arbitrary upstream errors private. */
        }
      }
      return authErrorResponse(
        response.status in errors ? response.status : 502,
        errors[response.status] ?? "Import could not finish. Nothing was saved."
      );
    }
    if (action === "analyze" && response.body) {
      headers.set("Content-Type", "application/x-ndjson");
      const reader = response.body.getReader();
      const stream = new ReadableStream({
        async pull(c) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              clearTimeout(timer);
              c.close();
            } else c.enqueue(value);
          } catch {
            clearTimeout(timer);
            c.error(new Error("Import connection interrupted"));
          }
        },
        async cancel() {
          clearTimeout(timer);
          controller.abort();
          await reader.cancel();
        },
      });
      return new Response(stream, { headers });
    }
    const result = await response.json();
    clearTimeout(timer);
    return Response.json(result, { headers });
  } catch (error) {
    clearTimeout(timer);
    return authErrorResponse(
      error instanceof Error && error.message === "large" ? 413 : 502,
      error instanceof Error && error.message === "large"
        ? "Import request is too large."
        : "Import could not finish. Refresh your workspace to check whether changes were saved."
    );
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> }
) {
  const { action } = await context.params;
  if (!["analyze", "read", "apply", "write"].includes(action))
    return authErrorResponse(404, "Not found");
  return proxy(request, action);
}
export async function GET(
  request: Request,
  context: { params: Promise<{ action: string }> }
) {
  const { action } = await context.params;
  if (action !== "context") return authErrorResponse(404, "Not found");
  return proxy(request, action);
}
