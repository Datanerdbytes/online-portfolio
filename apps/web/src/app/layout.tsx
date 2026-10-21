import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { resume } from "@/content/resume";
import { Header } from "@/components/header";
import { isAbsoluteHttpUrl } from "@/lib/resume";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.classList.toggle('dark',localStorage.getItem('portfolio-theme')==='dark')}catch{}`,
          }}
        />
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Header
          name={resume.profile.name}
          headline={resume.profile.headline}
          isSample={resume.isSample}
          email={resume.contact.email}
          links={(resume.contact.links ?? []).filter((link) =>
            isAbsoluteHttpUrl(link.url),
          )}
        />
        <div className="site-content">
          <main id="main-content" tabIndex={-1}>
            {children}
          </main>
          <footer className="site-footer">
            <div className="content-width footer-inner">
              <p>
                {resume.isSample
                  ? "Illustrative sample resume. Example entries are labeled as samples."
                  : `${resume.profile.name} · Personal portfolio`}
              </p>
              <Link href="/#about">Back to top ↑</Link>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
