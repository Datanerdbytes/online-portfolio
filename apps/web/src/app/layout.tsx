import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { resume } from "@/content/resume";
import { Header } from "@/components/header";
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
  description:
    `${resume.profile.headline}. ${resume.profile.introduction}`,
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
        <Header isSample={resume.isSample} />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-input bg-background py-8">
          <div className="container mx-auto px-4">
            <p className="text-center text-xs text-muted-foreground">
              {resume.isSample
                ? "Illustrative sample resume. Example entries are labeled as samples."
                : "Online resume and portfolio."}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
