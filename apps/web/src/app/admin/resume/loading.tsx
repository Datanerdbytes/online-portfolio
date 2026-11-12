import { Skeleton } from "@/components/ui/skeleton";

export default function ResumeEditorLoading() {
  return (
    <section className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 max-w-xl" />
      </div>
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <p className="sr-only">Loading the resume editor…</p>
    </section>
  );
}
