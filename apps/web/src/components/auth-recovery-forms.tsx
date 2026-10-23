"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AuthFeedback, AuthPanel } from "@/components/auth-panel";

function useRecoveryRequest() {
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function run(
    path: string,
    body: Record<string, string>,
    success: string,
    failure: string,
    onSuccess?: () => void
  ) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(`/api/auth/${path}`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "online-resume-admin",
        },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setMessage(success);
        onSuccess?.();
      } else {
        setFailed(true);
        setMessage(
          response.status === 429
            ? "Too many attempts. Please wait and try again."
            : response.status >= 500
              ? "The email service is temporarily unavailable. Please try again."
              : failure
        );
      }
    } catch {
      setFailed(true);
      setMessage("Unable to reach the service. Please try again.");
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return { run, busy, message, failed };
}

export function ForgotPasswordForm() {
  const request = useRecoveryRequest();
  return (
    <AuthPanel
      title="Reset your password"
      description="Enter your account email. If an account exists, we’ll send a link to choose a new password."
      footer={<Link href="/auth/signin">Back to sign in</Link>}
    >
      <form
        aria-busy={request.busy}
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const email = String(
            new FormData(event.currentTarget).get("email") ?? ""
          );
          void request.run(
            "forgot-password",
            { email },
            "If this email has an account, a reset link is on its way. Check your inbox and spam folder.",
            "Unable to request a reset. Check your email and try again."
          );
        }}
      >
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            maxLength={254}
            required
            disabled={request.busy}
            className="auth-input"
          />
        </div>
        <AuthFeedback message={request.message} failed={request.failed} />
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={request.busy}
        >
          {request.busy ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthPanel>
  );
}

export function VerifyEmailForm() {
  const request = useRecoveryRequest();
  const emailInput = useRef<HTMLInputElement>(null);
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("portfolio-verification-email");
      if (saved && emailInput.current && !emailInput.current.value)
        emailInput.current.value = saved;
    } catch {
      /* Email can always be entered manually when storage is unavailable. */
    }
  }, []);
  if (verified)
    return (
      <AuthPanel
        status
        title="Email verified"
        description="Your email is confirmed. You can now sign in to edit your portfolio."
      >
        <Button asChild size="lg" className="w-full">
          <Link href="/auth/signin">Continue to sign in</Link>
        </Button>
      </AuthPanel>
    );
  return (
    <AuthPanel
      title="Verify your email"
      description="Enter the six-digit code from your email. Check your inbox and spam folder, or request a new code below."
      footer={<Link href="/auth/signin">Back to sign in</Link>}
    >
      <form
        aria-busy={request.busy}
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void request.run(
            "verify-email",
            {
              email: String(data.get("email") ?? ""),
              otp: String(data.get("otp") ?? ""),
            },
            "Email verified.",
            "This code is invalid or expired. Request a new code.",
            () => {
              try {
                sessionStorage.removeItem("portfolio-verification-email");
              } catch {}
              setVerified(true);
            }
          );
        }}
      >
        <div>
          <label htmlFor="email">Email</label>
          <input
            ref={emailInput}
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            maxLength={254}
            required
            disabled={request.busy}
            className="auth-input"
          />
        </div>
        <div>
          <label htmlFor="otp">Verification code</label>
          <input
            id="otp"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
            disabled={request.busy}
            className="auth-input auth-code-input"
          />
        </div>
        <AuthFeedback message={request.message} failed={request.failed} />
        <div className="grid gap-3">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={request.busy}
          >
            {request.busy ? "Please wait…" : "Verify email"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            disabled={request.busy}
            onClick={() => {
              const input = emailInput.current;
              if (!input || !input.reportValidity()) return;
              void request.run(
                "send-verification",
                { email: input.value },
                "If verification is needed for this account, a code is on its way. Check your inbox and spam folder.",
                "Unable to send a code. Please try again."
              );
            }}
          >
            Send a new code
          </Button>
        </div>
      </form>
    </AuthPanel>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const request = useRecoveryRequest();
  const [complete, setComplete] = useState(false);
  const [mismatch, setMismatch] = useState("");
  if (!token)
    return (
      <AuthPanel
        title="Request a new reset link"
        description="This password reset link is missing or invalid. Request a fresh link to continue."
        footer={<Link href="/auth/signin">Back to sign in</Link>}
      >
        <Button asChild size="lg" className="w-full">
          <Link href="/auth/forgot-password">Send a new reset link</Link>
        </Button>
      </AuthPanel>
    );
  if (complete)
    return (
      <AuthPanel
        status
        title="Password updated"
        description="Sign in with your new password. Your portfolio is unchanged."
      >
        <Button asChild size="lg" className="w-full">
          <Link href="/auth/signin">Continue to sign in</Link>
        </Button>
      </AuthPanel>
    );
  return (
    <AuthPanel
      title="Choose a new password"
      description="Use at least eight characters, then confirm your new password."
      footer={
        <Link href="/auth/forgot-password">Request a new reset link</Link>
      }
    >
      <form
        aria-busy={request.busy}
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const password = String(data.get("password") ?? "");
          setMismatch("");
          if (password !== data.get("confirm")) {
            setMismatch("The passwords do not match.");
            return;
          }
          void request.run(
            "reset-password",
            { token, password },
            "Password updated.",
            "This link is invalid or expired, or the password was rejected. Use at least eight characters or request a new link.",
            () => {
              form.reset();
              setComplete(true);
            }
          );
        }}
      >
        <div>
          <label htmlFor="password">New password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={1024}
            required
            disabled={request.busy}
            className="auth-input"
          />
        </div>
        <div>
          <label htmlFor="confirm">Confirm new password</label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={1024}
            required
            disabled={request.busy}
            className="auth-input"
          />
        </div>
        <AuthFeedback
          message={mismatch || request.message}
          failed={Boolean(mismatch) || request.failed}
        />
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={request.busy}
        >
          {request.busy ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthPanel>
  );
}
