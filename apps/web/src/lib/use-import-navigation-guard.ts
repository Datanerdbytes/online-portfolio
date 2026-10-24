"use client";
import { useEffect, useRef, type RefObject } from "react";

/** Compare visible editor controls to their last saved/query-refreshed values. */
export function useImportNavigationGuard(
  container: RefObject<HTMLDivElement | null>,
  savedVersion: number,
  tab: string
) {
  const changed = useRef(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    function snapshot() {
      return JSON.stringify(
        Array.from(
          element!.querySelectorAll("input:not([type=file]),textarea,select")
        ).map((e) => {
          const input = e as HTMLInputElement;
          return [input.type, input.value, input.checked];
        })
      );
    }
    const baseline = snapshot();
    changed.current = false;
    const check = () => {
      changed.current = snapshot() !== baseline;
    };
    element.addEventListener("input", check);
    element.addEventListener("change", check);
    return () => {
      element.removeEventListener("input", check);
      element.removeEventListener("change", check);
    };
  }, [container, savedVersion, tab]);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a[href]");
      if (
        anchor?.getAttribute("href") === "/admin/import" &&
        changed.current &&
        !window.confirm(
          "You have unsaved resume edits. Cancel to save them first, or continue to discard them and import."
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);
}
