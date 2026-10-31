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
      <section className="builder-hero" aria-labelledby="builder-heading">
        <div className="content-width">
          <div className="builder-hero-inner">
            <p className="eyebrow">The app behind this portfolio</p>
            <h1 id="builder-heading" className="builder-title">
              Your work, <em>in one place.</em>
            </h1>
            <p className="builder-lede">
              This portfolio was built with Resume &amp; Portfolio. You can use
              the same app to create a home for your own resume and projects,
              with your own content and a link to share.
            </p>
            <div className="hero-actions">
              <Button asChild className="hero-button">
                <Link href="/auth/register">
                  Create your account
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="hero-button">
                <Link href="/">View example portfolio</Link>
              </Button>
            </div>
            <p className="builder-note">
              Your saved draft is private until you publish. Only you can edit
              it after signing in.
            </p>
          </div>
        </div>
      </section>

      <section className="portfolio-section" aria-labelledby="features-heading">
        <div className="content-width">
          <p className="eyebrow">Built around your work</p>
          <h2 id="features-heading" className="section-heading">
            A resume. A portfolio. Your space.
          </h2>
          <div className="builder-grid">
            {features.map(({ icon: Icon, title, description }) => (
              <article key={title} className="builder-card">
                <Icon
                  size={20}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="builder-card-icon"
                />
                <h3 className="builder-card-title">{title}</h3>
                <p className="builder-card-text">{description}</p>
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
          <ol className="builder-steps">
            {steps.map(({ title, description }, index) => (
              <li key={title} className="builder-step">
                <span className="builder-step-index" aria-hidden="true">
                  0{index + 1}
                </span>
                <h3 className="builder-step-title">{title}</h3>
                <p className="builder-step-text">{description}</p>
              </li>
            ))}
          </ol>
          <p className="builder-signin">
            Already have an account?{" "}
            <Link href="/auth/signin">Sign in to your editor</Link>.
          </p>
        </div>
      </section>
    </>
  );
}
