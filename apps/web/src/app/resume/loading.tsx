import { Skeleton } from "@/components/ui/skeleton";

export default function ResumeLoading() {
  return (
    <section className="resume-page" aria-busy="true">
      <div className="content-width resume-toolbar">
        <div>
          <p className="eyebrow">Curriculum vitae</p>
          <h1 className="resume-toolbar-title">Resume</h1>
        </div>
      </div>
      <div className="content-width resume-shell">
        <div className="resume-paper">
          <div className="resume-doc-header">
            <div className="resume-doc-identity">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-9 w-64" />
              <Skeleton className="mt-2 h-4 w-48" />
            </div>
            <div className="resume-doc-contact">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
          <div className="resume-doc-profile">
            <Skeleton className="h-3 w-32" />
            <div className="resume-doc-profile-body">
              <Skeleton className="h-20 w-20 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-11/12" />
                <Skeleton className="mt-2 h-4 w-3/4" />
              </div>
            </div>
          </div>
          <div className="resume-doc-columns">
            <div className="resume-doc-main">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-4 h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/3" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-10/12" />
              <Skeleton className="mt-8 h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/3" />
              <Skeleton className="mt-3 h-3 w-full" />
            </div>
            <div className="resume-doc-aside">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-4 h-3 w-3/4" />
              <Skeleton className="mt-2 h-3 w-2/3" />
              <Skeleton className="mt-2 h-3 w-3/5" />
              <Skeleton className="mt-8 h-3 w-24" />
              <Skeleton className="mt-4 h-4 w-4/5" />
            </div>
          </div>
        </div>
      </div>
      <p className="sr-only">Loading resume…</p>
    </section>
  );
}
