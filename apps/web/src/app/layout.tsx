import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { SiteFrame } from "@/components/site-frame";
import { Header } from "@/components/header";
import { isAbsoluteHttpUrl } from "@/lib/resume";
import { getAboutState, getContactState } from "@/lib/resume-server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Resume & Portfolio",
  description:
    "A resume and portfolio in data analytics and data engineering, with personal editing access.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [about, contact] = await Promise.all([
    getAboutState(null),
    getContactState(null),
  ]);
  const profile =
    about.status === "ok"
      ? about.data
      : {
          name: "Resume & Portfolio",
          headline: "Build and share your portfolio",
          avatar_url: null,
          avatar_updated_at: null,
        };
  const contactData = contact.status === "ok" ? contact.data : null;
  const links = (contactData?.links ?? []).filter((link) =>
    isAbsoluteHttpUrl(link.url)
  );
  const year = new Date().getFullYear();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
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
              email={contactData?.email ?? undefined}
              links={links}
              avatarUrl={profile.avatar_url}
              avatarUpdatedAt={profile.avatar_updated_at}
            />
          }
          defaultFooter={
            <footer className="site-footer">
              <div className="content-width footer-inner">
                <div className="footer-brand">
                  <p className="footer-name">
                    {profile.name}
                    <span>.</span>
                  </p>
                </div>
                <nav aria-label="Portfolio links" className="footer-links">
                  <Link href="/resume">Resume</Link>
                  {links.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.label}
                    </a>
                  ))}
                  <Link href="/build-your-portfolio">
                    Build your own portfolio
                  </Link>
                  <Link href="/auth/signin">Editor sign in</Link>
                  <Link href="/">Portfolio home</Link>
                </nav>
                <p className="footer-meta">
                  Built with Next.js &amp; FastAPI
                  <br />
                  {year}
                </p>
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
