"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

function subscribe(callback: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== "portfolio-theme" && event.key !== null) return;
    document.documentElement.classList.toggle(
      "dark",
      event.newValue === "dark"
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
    () => document.documentElement.classList.contains("dark"),
    () => false
  );

  function toggle() {
    document.documentElement.classList.toggle("dark", !dark);
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
