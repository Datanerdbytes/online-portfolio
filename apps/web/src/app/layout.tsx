import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFrame } from "@/components/site-frame";
import { Header } from "@/components/header";
import { isAbsoluteHttpUrl, resolveAccountResume } from "@/lib/resume";
import { getResumeCached } from "@/lib/resume-server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Resume & Portfolio",
  description: "Public resumes and projects, with personal editing access.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const apiResume = await getResumeCached();
  const resolved = apiResume ? resolveAccountResume(apiResume) : null;
  const profile = resolved?.profile ?? {
    name: "Resume & Portfolio",
    headline: "Build and share your portfolio",
    avatar_url: null,
    avatar_updated_at: null,
  };
  const contact = resolved?.contact ?? { email: null, links: [] };
  const links = (contact.links ?? []).filter((link) =>
    isAbsoluteHttpUrl(link.url)
  );
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.classList.toggle('dark',localStorage.getItem('portfolio-theme')==='dark')}catch{}`,
          }}
        />
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <SiteFrame
          defaultHeader={
            <Header
              name={profile.name}
              headline={profile.headline}
              isSample={resolved?.isSample ?? false}
              email={contact.email ?? undefined}
              links={links}
              avatarUrl={profile.avatar_url}
              avatarUpdatedAt={profile.avatar_updated_at}
            />
          }
          defaultFooter={
            <footer className="site-footer">
              <div className="content-width footer-inner">
                <p>
                  {resolved?.isSample
                    ? "Illustrative sample resume. Example entries are labeled as samples."
                    : resolved
                      ? `${profile.name} · Personal portfolio`
                      : "Resume & Portfolio"}
                </p>
                <nav
                  aria-label="Portfolio links"
                  className="flex flex-wrap items-center gap-x-5 text-xs"
                >
                  <Link
                    className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
                    href="/build-your-portfolio"
                  >
                    Build your own portfolio
                  </Link>
                  <Link
                    className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
                    href="/auth/signin"
                  >
                    Editor sign in
                  </Link>
                  <Link
                    className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
                    href="/#about"
                  >
                    Back to top ↑
                  </Link>
                </nav>
              </div>
            </footer>
          }
        >
          {children}
        </SiteFrame>
      </body>
    </html>
  );
}
