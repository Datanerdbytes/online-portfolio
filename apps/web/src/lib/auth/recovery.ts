import "server-only";

import { getNeonAuth } from "@/lib/auth/server";
import {
  authErrorResponse,
  authJsonResponse,
  boundedAuthJson,
  validateMutation,
} from "@/lib/auth";

type Action =
  "forgot-password" | "reset-password" | "send-verification" | "verify-email";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleRecovery(request: Request, action: Action) {
  const rejected = validateMutation(request);
  if (rejected) return authErrorResponse(rejected.status, rejected.detail);
  if (
    request.headers.get("content-type")?.split(";")[0].toLowerCase() !==
    "application/json"
  ) {
    return authErrorResponse(400, "Invalid request");
  }
  let fields: Record<string, unknown>;
  try {
    const body = await boundedAuthJson(request);
    if (typeof body !== "object" || body === null || Array.isArray(body))
      throw new Error();
    fields = body as Record<string, unknown>;
  } catch {
    return authErrorResponse(400, "Invalid request");
  }
  const keys = Object.keys(fields).sort().join(",");
  if (action === "reset-password") {
    if (
      keys !== "password,token" ||
      typeof fields.token !== "string" ||
      !/^[A-Za-z0-9._~-]{16,2048}$/.test(fields.token) ||
      typeof fields.password !== "string" || // pragma: allowlist secret (type check)
      fields.password.length < 8 ||
      new TextEncoder().encode(fields.password).length > 1024
    ) {
      return authErrorResponse(400, "Invalid reset details");
    }
  } else {
    if (
      typeof fields.email !== "string" ||
      fields.email.length > 254 ||
      !emailPattern.test(fields.email.trim()) ||
      keys !== (action === "verify-email" ? "email,otp" : "email")
    )
      return authErrorResponse(400, "Invalid request");
    fields.email = fields.email.trim().toLowerCase();
    if (
      action === "verify-email" &&
      (typeof fields.otp !== "string" || !/^\d{6}$/.test(fields.otp))
    ) {
      return authErrorResponse(400, "Enter the six-digit code from your email");
    }
  }
  try {
    const auth = getNeonAuth();
    const result =
      action === "forgot-password"
        ? await auth.requestPasswordReset({
            email: fields.email as string,
            redirectTo: new URL(
              "/auth/reset-password",
              process.env.ADMIN_WEB_ORIGIN!
            ).href,
          })
        : action === "reset-password"
          ? await auth.resetPassword({
              token: fields.token as string,
              newPassword: fields.password as string,
            })
          : action === "send-verification"
            ? await auth.emailOtp.sendVerificationOtp({
                email: fields.email as string,
                type: "email-verification",
              })
            : await auth.emailOtp.verifyEmail({
                email: fields.email as string,
                otp: fields.otp as string,
              });
    if (result.error) {
      const status = result.error.status;
      if (status === 429)
        return authErrorResponse(
          429,
          "Too many attempts. Please try again later."
        );
      if (status >= 500)
        return authErrorResponse(503, "Authentication service unavailable");
      // Identical acknowledgments prevent revealing whether an email has an account.
      if (action === "forgot-password" || action === "send-verification")
        return authJsonResponse({ accepted: true });
      return authErrorResponse(
        400,
        action === "reset-password"
          ? "This reset link is invalid or expired. Request a new one."
          : "This code is invalid or expired. Request a new one."
      );
    }
    return authJsonResponse(
      action === "reset-password"
        ? { reset: true }
        : action === "verify-email"
          ? { verified: true }
          : { accepted: true }
    );
  } catch {
    return authErrorResponse(503, "Authentication service unavailable");
  }
}
