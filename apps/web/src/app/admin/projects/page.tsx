import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchProjects } from "@/lib/api";
import { ProjectManager } from "@/components/project-manager";
import { AdminSessionControls } from "@/components/admin-session-controls";
import { ProjectsQueryProvider } from "@/components/projects-query-provider";
import {
  adminConfigurationError,
  readAdminToken,
  verifyIdentityViaBackend,
} from "@/lib/auth";
import { type Project } from "@/lib/api";
import { isProjectsResponse, projectResponse } from "@/lib/project-management";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const configurationError = adminConfigurationError();
  const token = await readAdminToken();
  if (configurationError) return <Unavailable hasSession={Boolean(token)} />;
  if (!token) redirect("/auth/signin?next=%2Fadmin%2Fprojects");
  const result = await verifyIdentityViaBackend(token);
  if (result.error) {
    if ([401, 403].includes(result.error.status)) {
      redirect("/auth/signin?next=%2Fadmin%2Fprojects");
    }
    return <Unavailable hasSession={Boolean(token)} />;
  }
  let projects: Project[] = [];
  let listStatus: "idle" | "loading" | "ok" | "unavailable" = "idle";
  try {
    const data = await fetchProjects(token);
    if (!isProjectsResponse(data)) throw new Error("Invalid project list");
    projects = data.items.map(projectResponse);
    listStatus = "ok";
  } catch {
    listStatus = "unavailable";
  }
  return (
    <section className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="mb-2 text-2xl font-bold">My projects</h1>
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
            dateTime={new Date(result.identity.expires_at * 1000).toISOString()}
          >
            {new Date(result.identity.expires_at * 1000).toISOString()}
          </time>
        </p>
        <p className="text-sm text-muted-foreground">
          Session and token renewal are managed by Neon.
        </p>
      </div>
      <p className="text-sm">
        Your content is public.{" "}
        <Link href={`/u/${result.identity.owner_id}`} className="underline">
          View your public portfolio
        </Link>
      </p>
      <AdminSessionControls />
      <ProjectsQueryProvider>
        <ProjectManager
          initialProjects={projects}
          initialListStatus={listStatus}
        />
      </ProjectsQueryProvider>
      <p className="text-sm text-muted-foreground">
        <Link
          href="/"
          className="underline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Return to public resume
        </Link>
      </p>
    </section>
  );
}

function Unavailable({ hasSession }: { hasSession: boolean }) {
  return (
    <section className="mx-auto max-w-md space-y-4 px-4 py-8">
      <h1 className="text-2xl font-bold">Administration unavailable</h1>
      <p className="text-sm text-muted-foreground">
        We could not verify your session. Please try again when the service is
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
