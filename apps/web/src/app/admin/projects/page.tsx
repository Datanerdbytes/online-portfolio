import { workspaceSession } from "@/lib/workspace";
import { fetchProjects, type Project } from "@/lib/api";
import { ProjectManager } from "@/components/project-manager";
import { ProjectsQueryProvider } from "@/components/projects-query-provider";
import { isProjectsResponse, projectResponse } from "@/lib/project-management";

export default async function AdminProjectsPage() {
  const session = await workspaceSession();
  if (!session) return null;
  let projects: Project[] = [];
  let listStatus: "ok" | "unavailable" = "unavailable";
  try {
    const data = await fetchProjects(session.token);
    if (!isProjectsResponse(data)) throw new Error("Invalid project list");
    projects = data.items.map(projectResponse);
    listStatus = "ok";
  } catch {
    /* The manager provides a retry while preserving drafts. */
  }
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Projects</h1>
        <p className="mt-2 text-muted-foreground">
          Add your work and arrange its order. Saved changes stay in your draft
          until you publish.
        </p>
      </div>
      <ProjectsQueryProvider>
        <ProjectManager
          initialProjects={projects}
          initialListStatus={listStatus}
        />
      </ProjectsQueryProvider>
    </section>
  );
}
