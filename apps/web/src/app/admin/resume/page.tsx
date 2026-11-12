import { workspaceSession } from "@/lib/workspace";
import { fetchBackend } from "@/lib/auth";
import { fetchProjects, fetchResume, type Project } from "@/lib/api";
import { ResumeWizard } from "@/components/resume-wizard";
import { ProjectsQueryProvider } from "@/components/projects-query-provider";
import { isProjectsResponse, projectResponse } from "@/lib/project-management";
import type { ImportContext } from "@/lib/resume-import";
import { parseStep } from "@/lib/resume-wizard";

export default async function AdminResumePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await workspaceSession();
  if (!session) return null;
  const params = await searchParams;
  const initialStep = parseStep(params.step);
  const importParam = Array.isArray(params.import)
    ? params.import[0]
    : params.import;
  const initialImport = importParam === "1" || importParam === "true";

  const [resume, importContext, projects] = await Promise.all([
    fetchResume(session.token),
    fetchBackend("/api/v1/resume-import/context", {
      headers: { Authorization: `Bearer ${session.token}` },
    }),
    (async () => {
      let items: Project[] = [];
      let listStatus: "ok" | "unavailable" = "unavailable";
      try {
        const data = await fetchProjects(session.token);
        if (!isProjectsResponse(data)) throw new Error("Invalid project list");
        items = data.items.map(projectResponse);
        listStatus = "ok";
      } catch {
        /* The project manager provides a retry while preserving drafts. */
      }
      return { items, listStatus };
    })(),
  ]);

  return (
    <ProjectsQueryProvider>
      {!resume && (
        <p role="alert" className="mb-4">
          We couldn’t load your saved resume. Your saved work is unchanged.
          Refresh to try again; the editor is read-only until it loads.
        </p>
      )}
      <ResumeWizard
        initialResume={resume}
        initialProjects={projects.items}
        initialListStatus={projects.listStatus}
        initialContext={
          importContext.error ? null : (importContext.body as ImportContext)
        }
        initialStep={initialStep}
        initialImport={initialImport}
      />
    </ProjectsQueryProvider>
  );
}
