import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, Globe, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Build your own portfolio | Resume & Portfolio",
  description:
    "Create a public home for your resume and projects, with a private editor and your own shareable portfolio link.",
};

const features = [
  {
    icon: FileText,
    title: "A place for your story",
    description:
      "Bring your introduction, skills, experience, education and projects together in one portfolio.",
  },
  {
    icon: LockKeyhole,
    title: "Your own editing space",
    description:
      "Start with an empty portfolio. Sign in to add your content and update it as your work grows.",
  },
  {
    icon: Globe,
    title: "Ready to share",
    description:
      "Share your personal portfolio link. Visitors can read your resume and projects without creating an account.",
  },
];

const steps = [
  {
    title: "Create your account",
    description:
      "Sign up with your email and verify it with the code we send you.",
  },
  {
    title: "Make it yours",
    description:
      "Add your resume details, images and project work in your private editor.",
  },
  {
    title: "Share your work",
    description:
      "Preview your saved draft, publish it, and share your portfolio link.",
  },
];

export default function BuildYourPortfolioPage() {
  return (
    <>
      <section
        className="hero-section py-16 sm:py-24"
        aria-labelledby="builder-heading"
      >
        <div className="content-width">
          <p className="eyebrow">The app behind this portfolio</p>
          <h1
            id="builder-heading"
            className="mt-5 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl"
          >
            Your work, in one place.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground">
            This portfolio was built with Resume &amp; Portfolio. You can use
            the same app to create a home for your own resume and projects, with
            your own content and a link to share.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/auth/register">
                Create your account
                <ArrowRight className="ml-2 size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/">View example portfolio</Link>
            </Button>
          </div>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
            Your saved draft is private until you publish. Only you can edit it
            after signing in.
          </p>
        </div>
      </section>

      <section className="portfolio-section" aria-labelledby="features-heading">
        <div className="content-width">
          <p className="eyebrow">Built around your work</p>
          <h2 id="features-heading" className="section-heading">
            A resume. A portfolio. Your space.
          </h2>
          <div className="mt-9 grid gap-5 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="rounded-lg border border-border bg-background p-6"
              >
                <Icon className="mb-5 size-6 text-primary" aria-hidden="true" />
                <h3 className="text-lg font-semibold tracking-tight">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="portfolio-section section-tinted"
        aria-labelledby="steps-heading"
      >
        <div className="content-width">
          <p className="eyebrow">Getting started</p>
          <h2 id="steps-heading" className="section-heading">
            From blank page to your portfolio.
          </h2>
          <ol className="mt-9 grid gap-8 lg:grid-cols-3">
            {steps.map(({ title, description }, index) => (
              <li key={title}>
                <span
                  className="text-sm font-semibold text-primary"
                  aria-hidden="true"
                >
                  0{index + 1}
                </span>
                <h3 className="mt-3 text-lg font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {description}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-10 text-sm leading-7 text-muted-foreground">
            Already have an account?{" "}
            <Link
              className="font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
              href="/auth/signin"
            >
              Sign in to your editor
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
