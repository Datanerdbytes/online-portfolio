"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HealthStatus } from "@/components/health-status";

const NAV_ITEMS = [
  { label: "About", href: "#about" },
  { label: "Skills", href: "#skills" },
  { label: "Projects", href: "#projects" },
  { label: "Experience", href: "#experience" },
  { label: "Contact", href: "#contact" },
] as const;

export function Header() {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const toggle = useCallback(() => setOpen((current) => !current), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && open) {
        close();
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  return (
    <header className="sticky top-0 z-20 w-full border-b border-input bg-background/80 backdrop-blur backdrop-filter-backdrop">
      <div className="container mx-auto px-4">
        {/* Fixed-height row: branding and controls only. The full API alert is
            deliberately not placed here so it can never be clipped by the row. */}
        <div className="flex h-16 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-tight">Online Resume</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              placeholder
            </span>
          </div>
          <button
            ref={menuButtonRef}
            type="button"
            aria-expanded={open}
            aria-controls="header-navigation"
            aria-label={open ? "Close main menu" : "Open main menu"}
            onClick={toggle}
            className="md:hidden inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-2 rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
          >
            {open ? (
              <>
                <span className="sr-only">Close main menu</span>
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </>
            ) : (
              <>
                <span className="sr-only">Open main menu</span>
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </>
            )}
          </button>
        </div>

        {/* Desktop: full navigation row with room for the full health alert. */}
        <div className="hidden md:flex md:items-center md:gap-4">
          <nav aria-label="Main" className="flex items-center gap-4">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-sm text-foreground/70 hover:text-foreground transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <HealthStatus />
          </div>
        </div>

        {/* Mobile panel: expands below the fixed-height row, so the full API
            alert and navigation stay readable without clipping or crowding. */}
        {open && (
          <nav
            id="header-navigation"
            aria-label="Main"
            className="md:hidden flex flex-col gap-1 border-t border-input bg-background py-2"
          >
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={close}
                className="block px-3 py-2 text-sm text-foreground rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-3 pt-3 border-t border-input">
              <HealthStatus />
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
