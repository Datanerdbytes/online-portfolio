import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { HealthStatus } from "@/components/health-status";
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
  title: "Online Resume / Portfolio",
  description:
    "Starter online resume and portfolio. All resume content is clearly labeled as placeholder.",
};

export default function RootLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 w-full border-b border-input bg-background/80 backdrop-blur backdrop-filter-backdrop">
          <div className="container mx-auto px-4">
            <div className="flex h-16 items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-tight">Online Resume</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  placeholder
                </span>
              </div>
              <nav className="flex items-center gap-4">
                <a href="#about" className="text-sm text-foreground/70 hover:text-foreground transition-colors">
                  About
                </a>
                <a href="#skills" className="text-sm text-foreground/70 hover:text-foreground transition-colors">
                  Skills
                </a>
                <a href="#projects" className="text-sm text-foreground/70 hover:text-foreground transition-colors">
                  Projects
                </a>
                <a href="#experience" className="text-sm text-foreground/70 hover:text-foreground transition-colors">
                  Experience
                </a>
                <a href="#contact" className="text-sm text-foreground/70 hover:text-foreground transition-colors">
                  Contact
                </a>
              </nav>
              <div className="flex items-center gap-2">
                <HealthStatus />
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-input bg-background py-8">
          <div className="container mx-auto px-4">
            <p className="text-center text-xs text-muted-foreground">
              Starter online resume portfolio. All resume entries are clearly
              labeled placeholders.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
