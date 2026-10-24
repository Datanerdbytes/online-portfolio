import { redirect } from "next/navigation";
import { adminConfigurationError, verifyIdentityViaBackend } from "@/lib/auth";
import { getNeonAuth } from "@/lib/auth/server";
import SignInForm from "./signin-form";

export const dynamic = "force-dynamic";

const SIGN_IN_DESTINATIONS = [
  "/admin",
  "/admin/resume",
  "/admin/projects",
  "/admin/preview",
  "/admin/account",
];

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  let token: string | undefined;
  if (!adminConfigurationError()) {
    try {
      const session = await getNeonAuth().token();
      if (!session.error) token = session.data?.token;
    } catch {
      // Keep sign-in available during a provider outage; the login API fails closed.
    }
  }

  if (token) {
    const result = await verifyIdentityViaBackend(token);
    if (result.identity) {
      const params = await searchParams;
      const next = typeof params.next === "string" ? params.next : null;
      redirect(SIGN_IN_DESTINATIONS.includes(next ?? "") ? next! : "/admin");
    }
  }

  return <SignInForm />;
}
