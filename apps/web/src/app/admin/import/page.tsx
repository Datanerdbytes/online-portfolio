import { workspaceSession } from "@/lib/workspace";
import { fetchBackend } from "@/lib/auth";
import type { ImportContext } from "@/lib/resume-import";
import { ResumeImporter } from "@/components/resume-importer";
export default async function ImportResumePage() {
  const session = await workspaceSession();
  if (!session) return null;
  const result = await fetchBackend("/api/v1/resume-import/context", {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  if (result.error)
    return (
      <p role="alert">
        We couldn’t load your draft. Refresh to retry; your saved work is
        unchanged.
      </p>
    );
  return <ResumeImporter initial={result.body as ImportContext} />;
}
