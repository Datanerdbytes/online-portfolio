"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Re-applies the stored theme preference to <html>.
 *
 * Mirrors the inline `theme-init` payload in the root layout: the payload
 * covers first paint, while this helper re-syncs after a client render —
 * if hydration recovery re-acquires <html>, the class the payload applied
 * is gone and nothing else restores it.
 */
export function applyStoredTheme() {
  try {
    const saved = localStorage.getItem("portfolio-theme");
    document.documentElement.classList.toggle("light", saved === "light");
  } catch {
    /* Keep whatever class is already applied. */
  }
  window.dispatchEvent(new Event("portfolio-theme"));
}

function subscribe(callback: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== "portfolio-theme" && event.key !== null) return;
    document.documentElement.classList.toggle(
      "light",
      event.newValue !== "dark"
    );
    callback();
  }
  window.addEventListener("portfolio-theme", callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("portfolio-theme", callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribe,
    () => !document.documentElement.classList.contains("light"),
    () => true
  );

  useEffect(() => {
    applyStoredTheme();
  }, []);

  function toggle() {
    document.documentElement.classList.toggle("light", dark);
    try {
      localStorage.setItem("portfolio-theme", dark ? "light" : "dark");
    } catch {
      /* Theme changes still work when storage is blocked. */
    }
    window.dispatchEvent(new Event("portfolio-theme"));
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      onClick={toggle}
    >
      {dark ? (
        <Sun size={16} aria-hidden="true" />
      ) : (
        <Moon size={16} aria-hidden="true" />
      )}
    </button>
  );
}
