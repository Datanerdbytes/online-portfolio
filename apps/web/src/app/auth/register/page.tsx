"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthFeedback, AuthPanel } from "@/components/auth-panel";

export default function RegisterPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const active = useRef(false);
  async function register(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    active.current = true;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "online-resume-admin",
        },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          password: data.get("password"),
        }),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
      if (response.ok) {
        form.reset();
        try {
          sessionStorage.setItem(
            "portfolio-verification-email",
            String(data.get("email") ?? "")
          );
        } catch {}
        router.push("/auth/verify-email");
      } else if (response.status === 429)
        setMessage("Too many attempts. Please try again later.");
      else if (response.status === 503)
        setMessage("Registration is unavailable. Please try again.");
      else
        setMessage(
          "Check your details, or sign in if your email is already registered."
        );
    } catch {
      setMessage("Unable to reach registration. Please try again.");
    } finally {
      active.current = false;
      setPending(false);
    }
  }
  return (
    <AuthPanel
      title="Create your account"
      description="Start with a private draft and make it yours. Verify your email, add your story, then publish when you’re ready."
      footer={
        <>
          Already have an account? <Link href="/auth/signin">Sign in</Link>
        </>
      }
    >
      <form onSubmit={register} aria-busy={pending} className="space-y-5">
        <div>
          <label htmlFor="name">Display name</label>
          <input
            className="auth-input"
            id="name"
            name="name"
            autoComplete="name"
            maxLength={200}
            required
            disabled={pending}
          />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input
            className="auth-input"
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            maxLength={254}
            required
            disabled={pending}
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            className="auth-input"
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={1024}
            required
            disabled={pending}
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="auth-field-hint">
            Use at least eight characters. We’ll email you a verification code.
          </p>
        </div>
        <AuthFeedback message={message} failed />
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthPanel>
  );
}
