"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthFeedback, AuthPanel } from "@/components/auth-panel";

export default function SignInPage() {
  const router = useRouter();
  const active = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(
    () => () => {
      const controller = active.current;
      active.current = null;
      controller?.abort();
    },
    []
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const username = String(data.get("username") ?? "");
    const password = String(data.get("password") ?? "");
    if (new TextEncoder().encode(password).length > 1024) {
      setError("Password must be no more than 1024 bytes.");
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "online-resume-admin",
        },
        body: JSON.stringify({ username, password }),
      });
      if (response.status === 429)
        setError("Too many login attempts. Please try again later.");
      else if (response.status === 401)
        setError("Invalid credentials. Please try again.");
      else if (response.status === 403) {
        const body = await response.json().catch(() => null);
        if (body?.detail === "Verify your email before signing in") {
          try {
            sessionStorage.setItem(
              "portfolio-verification-email",
              username.trim().toLowerCase()
            );
          } catch {
            // The verification form also accepts an email entered manually.
          }
          setError(
            "Your email has not been verified yet. Use the verification link below to enter your code or request a new one."
          );
        } else {
          setError(
            "This sign-in request could not be accepted. Refresh the page and try again."
          );
        }
      } else if (!response.ok)
        setError("Administration is unavailable. Please try again.");
      else {
        form.reset();
        const next = new URLSearchParams(window.location.search).get("next");
        const destination = [
          "/admin",
          "/admin/resume",
          "/admin/projects",
          "/admin/preview",
          "/admin/account",
        ].includes(next ?? "")
          ? next!
          : "/admin";
        router.replace(destination);
        router.refresh();
      }
    } catch {
      if (active.current === controller)
        setError("Unable to reach the authentication service.");
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) {
        active.current = null;
        setSubmitting(false);
      }
    }
  }

  return (
    <AuthPanel
      title="Welcome back"
      description="Sign in to work on your draft, preview changes, and manage your published portfolio."
      footer={
        <>
          New here? <Link href="/auth/register">Create your account</Link>
        </>
      }
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-5"
        aria-busy={submitting}
      >
        <AuthFeedback message={error} failed />
        <div>
          <label htmlFor="username">Email</label>
          <input
            id="username"
            name="username"
            type="email"
            autoComplete="username"
            maxLength={200}
            required
            disabled={submitting}
            className="auth-input"
          />
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <label htmlFor="password">Password</label>
            <Link className="auth-inline-link" href="/auth/forgot-password">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={1024}
            required
            disabled={submitting}
            className="auth-input"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={submitting}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-center">
          <Link className="auth-inline-link" href="/auth/verify-email">
            Verify your email or request a new code
          </Link>
        </p>
      </form>
    </AuthPanel>
  );
}
