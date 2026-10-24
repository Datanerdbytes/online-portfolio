import type { ReactNode } from "react";
import { workspaceSession } from "@/lib/workspace";
import { AdminSessionControls } from "@/components/admin-session-controls";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await workspaceSession();
  if (!session)
    return (
      <section className="mx-auto max-w-xl space-y-4 px-4 py-12">
        <h1 className="text-2xl font-bold">
          Your workspace is temporarily unavailable
        </h1>
        <p>
          We couldn’t load your portfolio workspace. Please retry in a moment.
          Your saved work is unchanged.
        </p>
        <AdminSessionControls canCheck={false} />
      </section>
    );
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">{children}</div>
  );
}
