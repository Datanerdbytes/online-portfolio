import Link from "next/link";
import {
  adminConfigurationError,
  readAdminToken,
  verifyIdentityViaBackend,
} from "@/lib/auth";
import { fetchResume } from "@/lib/api";
import { AdminSessionControls } from "@/components/admin-session-controls";
import { ResumeManager } from "@/components/resume-manager";
import { ProjectsQueryProvider } from "@/components/projects-query-provider";

export const dynamic = "force-dynamic";

export default async function AdminResumePage() {
  const configurationError = adminConfigurationError();
  const token = await readAdminToken();
  if (configurationError) return <Unavailable hasSession={Boolean(token)} />;
  if (!token) return <SignInGate />;
  const result = await verifyIdentityViaBackend(token);
  if (result.error) {
    return [401, 403].includes(result.error.status) ? (
      <SignInGate />
    ) : (
      <Unavailable hasSession={Boolean(token)} />
    );
  }

  const resume = await fetchResume();

  return (
    <section className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="mb-2 text-2xl font-bold">Admin: Resume</h1>
        <p className="break-words text-sm text-muted-foreground">
          Identity verified. Owner: {result.identity.owner_id}
        </p>
      </div>

      <div className="space-y-2 rounded-md border p-4">
        <h2 className="font-semibold">Session status</h2>
        <p className="text-sm">Authenticated</p>
        <p className="break-words text-sm text-muted-foreground">
          Session expires at:{" "}
          <time
            dateTime={new Date(
              result.identity.expires_at * 1000
            ).toISOString()}
          >
            {new Date(result.identity.expires_at * 1000).toISOString()}
          </time>
        </p>
        <p className="text-sm text-muted-foreground">
          Sign in again after 15 minutes. Activity does not extend your
          session.
        </p>
      </div>

      <AdminSessionControls />

      {resume ? (
        <ProjectsQueryProvider>
          <ResumeManager
            profile={resume.profile}
            skills={resume.skills}
            experience={resume.experience}
            education={resume.education}
            contact={resume.contact}
          />
        </ProjectsQueryProvider>
      ) : (
        <div className="rounded-md border p-4">
          <p className="text-sm text-destructive">
            Could not load resume data. Make sure the backend API is running
            and try refreshing.
          </p>
        </div>
      )}

      <div className="flex gap-4 text-sm">
        <Link
          href="/admin/projects"
          className="underline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Manage projects
        </Link>
        <Link
          href="/"
          className="underline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Return to public resume
        </Link>
      </div>
    </section>
  );
}

function SignInGate() {
  return (
    <section className="mx-auto max-w-md space-y-4 px-4 py-8">
      <h1 className="text-2xl font-bold">Sign in required</h1>
      <p className="text-sm text-muted-foreground">
        Administration is restricted to the portfolio owner.
      </p>
      <Link
        href="/auth/signin"
        className="inline-flex min-h-11 items-center rounded underline focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        Go to sign in
      </Link>
    </section>
  );
}

function Unavailable({ hasSession }: { hasSession: boolean }) {
  return (
    <section className="mx-auto max-w-md space-y-4 px-4 py-8">
      <h1 className="text-2xl font-bold">Administration unavailable</h1>
      <p className="text-sm text-muted-foreground">
        Could not verify your session. Please try again when the service is
        available.
      </p>
      {hasSession ? (
        <AdminSessionControls canCheck={false} />
      ) : (
        <Link
          href="/auth/signin"
          className="inline-flex min-h-11 items-center rounded underline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Go to sign in
        </Link>
      )}
    </section>
  );
}
