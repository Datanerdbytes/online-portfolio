import { notFound } from "next/navigation";
import { API_BASE_URL, type ApiResume, type ProjectsResponse } from "@/lib/api";
import { resolveAccountResume } from "@/lib/resume";
import { ResumeDocument } from "@/components/resume-document";
import { ShareLinkButton } from "@/components/share-link-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Public resume and projects" };

async function loadPortfolio(userId: string) {
  const base = `${API_BASE_URL}/api/v1/public/users/${encodeURIComponent(userId)}`;
  try {
    const [resumeResponse, projectsResponse] = await Promise.all([
      fetch(`${base}/resume`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${base}/projects`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }),
    ]);
    if (resumeResponse.status === 404 || projectsResponse.status === 404)
      return { missing: true as const };
    if (!resumeResponse.ok || !projectsResponse.ok) return null;
    return {
      resume: resolveAccountResume((await resumeResponse.json()) as ApiResume),
      projects: (await projectsResponse.json()) as ProjectsResponse,
    };
  } catch {
    return null;
  }
}

export default async function PublicPortfolio({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  if (!/^[a-zA-Z0-9-]{1,128}$/.test(userId)) notFound();
  const data = await loadPortfolio(userId);
  if (!data) return <p>Portfolio is temporarily unavailable. Please retry.</p>;
  if ("missing" in data) notFound();
  if (!data.resume) return <p>This portfolio has no resume yet.</p>;
  return (
    <section className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex justify-end print:hidden">
        <ShareLinkButton path={`/u/${userId}`} />
      </div>
      <ResumeDocument resume={data.resume} projects={data.projects.items} />
    </section>
  );
}
