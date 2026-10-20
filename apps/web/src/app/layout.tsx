import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
        <Header />
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
