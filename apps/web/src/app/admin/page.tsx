import Link from "next/link";
import { Button } from "@/components/ui/button";
import { workspaceSession } from "@/lib/workspace";
import { loadPortfolioStatus } from "@/lib/portfolio-server";
import { ShareLinkButton } from "@/components/share-link-button";

export default async function WorkspacePage() {
  const session = await workspaceSession();
  if (!session) return null;
  const status = await loadPortfolioStatus(session.token);
  if (!status)
    return (
      <p role="alert">
        Your workspace status is unavailable. Please refresh in a moment.
      </p>
    );
  const steps = [
    {
      title: "Introduce yourself",
      detail: "Add your name, headline, and a short introduction.",
      done: status.profile_complete,
      href: "/admin/resume",
      action: "Edit resume",
    },
    {
      title: "Tell your story",
      detail:
        "Add experience or a project. You can also add education, skills, and contact details.",
      done: status.has_work,
      href: "/admin/projects",
      action: "Edit projects",
    },
    {
      title: "Preview and publish",
      detail: "Review your saved draft, publish it, and share your link.",
      done: status.is_published,
      href: "/admin/preview",
      action: "Preview portfolio",
    },
  ];
  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <p className="eyebrow">Your portfolio workspace</p>
        <h1 className="text-3xl font-bold">
          {status.is_published && status.profile_complete
            ? "Make your next update"
            : "Let’s build your portfolio"}
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Start with your introduction and build at your own pace. Saving keeps
          your work as a private draft; publishing makes it visible to visitors.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5">
        <p className="grow font-medium">
          {status.is_published
            ? status.has_unpublished_changes
              ? "Live · unpublished changes saved"
              : "Live · all saved changes published"
            : "Private · not published yet"}
        </p>
        <Button asChild>
          <Link href="/admin/preview">Preview portfolio</Link>
        </Button>
        {status.is_published && (
          <ShareLinkButton path={`/u/${status.owner_id}`} />
        )}
      </div>
      <ol className="grid gap-4 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col gap-3 rounded-xl border bg-card p-5"
          >
            <p className="text-sm text-muted-foreground">
              Step {index + 1} ·{" "}
              {step.done ? "Complete" : index === 1 ? "Optional" : "To do"}
            </p>
            <h2 className="text-xl font-semibold">{step.title}</h2>
            <p className="grow text-sm text-muted-foreground">{step.detail}</p>
            <Link
              className="inline-flex min-h-11 items-center underline underline-offset-4"
              href={step.href}
            >
              {step.action}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
