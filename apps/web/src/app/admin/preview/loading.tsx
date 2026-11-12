import { Skeleton } from "@/components/ui/skeleton";

export default function PreviewLoading() {
  return (
    <section className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-9 w-72" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
      <p className="sr-only">Loading the preview…</p>
    </section>
  );
}
