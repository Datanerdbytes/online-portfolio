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
        <div className="flex h-16 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col items-start gap-0 sm:flex-row sm:items-center sm:gap-2">
            <span className="whitespace-nowrap font-semibold tracking-tight">Online Resume</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              placeholder
            </span>
          </div>
          <nav aria-label="Main" className="hidden md:flex items-center gap-4 shrink-0">
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
          <div className="flex items-center gap-2 shrink-0">
            {/* Compact API health indicator. Rendered once, in the fixed-height
                row, so it stays visible on mobile and desktop without opening
                the mobile menu. */}
            <HealthStatus />
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
        </div>

        {/* Mobile panel: navigation links only. The health indicator remains
            visible above in the fixed-height row. */}
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
          </nav>
        )}
      </div>
    </header>
  );
}
