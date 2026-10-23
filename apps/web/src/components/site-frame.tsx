"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

/** Account pages must not inherit the default portfolio owner's identity. */
export function SiteFrame({
  children,
  defaultHeader,
  defaultFooter,
}: {
  children: ReactNode;
  defaultHeader: ReactNode;
  defaultFooter: ReactNode;
}) {
  const pathname = usePathname();
  const builderPage = pathname === "/build-your-portfolio";
  const editorPage = pathname.startsWith("/admin/");
  const accountPage = ["/auth/", "/admin/", "/u/"].some((prefix) =>
    pathname.startsWith(prefix)
  );
  return (
    <>
      {accountPage || builderPage ? (
        <header className="app-topbar">
          <Link
            href={editorPage ? "/admin/resume" : "/build-your-portfolio"}
            className="app-topbar-brand"
          >
            {editorPage ? "Portfolio editor" : "Resume & Portfolio"}
          </Link>
          <nav aria-label={editorPage ? "Editor navigation" : "App navigation"}>
            {editorPage ? (
              <>
                <Link
                  href="/admin/resume"
                  aria-current={
                    pathname === "/admin/resume" ? "page" : undefined
                  }
                >
                  My resume
                </Link>
                <Link
                  href="/admin/projects"
                  aria-current={
                    pathname === "/admin/projects" ? "page" : undefined
                  }
                >
                  My projects
                </Link>
              </>
            ) : (
              <>
                <Link href="/">View personal portfolio</Link>
                {builderPage ? (
                  <Link href="/auth/signin">Sign in</Link>
                ) : (
                  <Link href="/build-your-portfolio">About the app</Link>
                )}
              </>
            )}
            <ThemeToggle />
          </nav>
        </header>
      ) : (
        defaultHeader
      )}
      <div
        className={
          accountPage || builderPage
            ? "site-content site-content-neutral"
            : "site-content"
        }
      >
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        {accountPage || builderPage ? (
          <footer className="site-footer">
            <div className="content-width footer-inner">
              <p>Public portfolios. Personal editing access.</p>
              <Link href="/">View personal portfolio</Link>
            </div>
          </footer>
        ) : (
          defaultFooter
        )}
      </div>
    </>
  );
}
