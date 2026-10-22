import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { resume } from "@/content/resume";
import { Header } from "@/components/header";
import { isAbsoluteHttpUrl, resolveResume } from "@/lib/resume";
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
  title: `${resume.profile.name} | Resume & Portfolio`,
  description: `${resume.profile.headline}. ${resume.profile.introduction}`,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const apiResume = await getResumeCached();
  const resolved = resolveResume(apiResume);
  const profile = resolved.profile;
  const contact = resolved.contact;
  const links = (contact.links ?? []).filter((link) =>
    isAbsoluteHttpUrl(link.url),
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
        <Header
          name={profile.name}
          headline={profile.headline}
          isSample={resolved.isSample}
          email={contact.email ?? undefined}
          links={links}
          avatarUrl={profile.avatar_url}
          avatarUpdatedAt={profile.avatar_updated_at}
        />
        <div className="site-content">
          <main id="main-content" tabIndex={-1}>
            {children}
          </main>
          <footer className="site-footer">
            <div className="content-width footer-inner">
              <p>
                {resolved.isSample
                  ? "Illustrative sample resume. Example entries are labeled as samples."
                  : `${profile.name} · Personal portfolio`}
              </p>
              <Link href="/#about">Back to top ↑</Link>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
