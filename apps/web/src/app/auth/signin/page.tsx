"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function SignInPage() {
  const router = useRouter();
  const active = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => () => { const controller = active.current; active.current = null; controller?.abort(); }, []);

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
        method: "POST", signal: controller.signal, cache: "no-store",
        headers: { "Content-Type": "application/json", "X-Requested-With": "online-resume-admin" },
        body: JSON.stringify({ username, password }),
      });
      if (response.status === 429) setError("Too many login attempts. Please try again later.");
      else if (response.status === 401) setError("Invalid credentials. Please try again.");
      else if (!response.ok) setError("Administration is unavailable. Please try again.");
      else {
        form.reset();
        router.replace("/admin/projects");
        router.refresh();
      }
    } catch {
      if (active.current === controller) setError("Unable to reach the authentication service.");
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) {
        active.current = null;
        setSubmitting(false);
      }
    }
  }

  return <section className="mx-auto max-w-md px-4 py-8">
    <h1 className="mb-6 text-2xl font-bold">Sign in</h1>
    <form onSubmit={handleSubmit} className="space-y-5" aria-busy={submitting}>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <div>
        <label htmlFor="username" className="mb-1 block text-sm font-medium">Username</label>
        <input id="username" name="username" autoComplete="username" maxLength={200} required
          disabled={submitting} className="min-h-11 w-full rounded-md border border-input px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" maxLength={1024} required
          disabled={submitting} className="min-h-11 w-full rounded-md border border-input px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-sm text-muted-foreground">Portfolio owner access only. Public browsing does not require sign-in.</p>
    </form>
  </section>;
}
