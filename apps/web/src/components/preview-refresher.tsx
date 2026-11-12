"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the server-rendered preview when the user comes back to the
 * tab, returns via browser Back, or the window regains focus — so saved
 * editor changes appear without a manual "Refresh preview" click.
 */
export function PreviewRefresher() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("popstate", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("popstate", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);
  return null;
}
