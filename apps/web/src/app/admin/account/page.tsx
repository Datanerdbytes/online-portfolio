import Link from "next/link";
import { workspaceSession } from "@/lib/workspace";
import { getNeonAuth } from "@/lib/auth/server";
import { AdminSessionControls } from "@/components/admin-session-controls";

export default async function AccountPage() {
  const session = await workspaceSession();
  if (!session) return null;
  let user;
  try {
    const result = await getNeonAuth().getSession();
    user = result.data?.user;
  } catch {
    /* Show a retryable account state below. */
  }
  return (
    <section className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">Account</h1>
      <div className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">Sign-in details</h2>
        {user ? (
          <>
            <p className="break-words">{user.email}</p>
            <p>
              {user.emailVerified
                ? "Email verified"
                : "Email verification incomplete"}
            </p>
            {!user.emailVerified && (
              <Link className="underline" href="/auth/verify-email">
                Finish email verification
              </Link>
            )}
          </>
        ) : (
          <p>
            Account details are temporarily unavailable. Refresh to try again.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Your sign-in email is private. Public contact details are managed
          separately in your resume.
        </p>
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">Password and session</h2>
        <p>
          <Link
            className="inline-flex min-h-11 items-center underline"
            href="/auth/forgot-password"
          >
            Reset your password
          </Link>
        </p>
        <p className="text-sm text-muted-foreground">
          Password resets preserve your verified email and portfolio. Use the
          link in your recovery email to choose a new password.
        </p>
        <AdminSessionControls />
      </div>
    </section>
  );
}
