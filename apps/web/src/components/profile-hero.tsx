import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApiProfile } from "@/lib/api";
import { profileImageUrl, BANNER_PATH, initialsFromName } from "@/lib/avatar";

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return { first: name, last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts.at(-1) ?? "" };
}

export function ProfileHero({
  profile,
  email,
  projectsHref = "/projects",
  resumeHref = "/resume",
}: {
  profile: ApiProfile;
  email: string | null;
  projectsHref?: string;
  resumeHref?: string;
}) {
  const bannerSrc = profileImageUrl(
    profile.banner_url,
    profile.banner_updated_at,
    BANNER_PATH
  );
  const avatarSrc = profileImageUrl(
    profile.avatar_url,
    profile.avatar_updated_at
  );
  const portraitSrc = bannerSrc ?? avatarSrc;
  const { first, last } = splitName(profile.name);
  const year = new Date().getFullYear();

  return (
    <section id="about" aria-labelledby="intro-heading" className="hero">
      <div className="content-width hero-grid">
        <div className="hero-copy">
          <p className="hero-kicker">Resume &amp; portfolio</p>
          <h1 id="intro-heading" className="hero-name">
            {first}
            {last && (
              <>
                {" "}
                <em>{last}</em>
              </>
            )}
          </h1>
          <p className="hero-headline">{profile.headline}</p>
          <p className="hero-description">{profile.introduction}</p>
          <div className="hero-actions">
            <Button asChild size="lg" className="hero-button">
              <Link href={projectsHref}>
                Explore selected work
                <ArrowDownRight size={16} aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="hero-button">
              <Link href={resumeHref}>
                <FileText size={15} aria-hidden="true" />
                Read resume
              </Link>
            </Button>
          </div>
          {(profile.location || email) && (
            <div className="hero-facts">
              {profile.location && (
                <div className="hero-fact">
                  <span className="hero-fact-label">Based in</span>
                  <span className="hero-fact-value">{profile.location}</span>
                </div>
              )}
              {email && (
                <div className="hero-fact">
                  <span className="hero-fact-label">Email</span>
                  <a className="hero-fact-value" href={`mailto:${email}`}>
                    {email}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="hero-visual">
          <div className="portrait-wrap">
            <div className="portrait-frame">
              {portraitSrc ? (
                <Image
                  src={portraitSrc}
                  alt={`${profile.name} portrait`}
                  width={1200}
                  height={1500}
                  priority
                  sizes="(max-width: 1023px) 400px, 440px"
                  className="portrait-image"
                  unoptimized
                />
              ) : (
                <div className="portrait-fallback">
                  <span className="portrait-monogram">
                    {initialsFromName(profile.name)}
                  </span>
                  <span className="portrait-fallback-caption">
                    <span>Portrait</span>
                    <span>Add one in the editor</span>
                  </span>
                </div>
              )}
            </div>
            <span className="portrait-chip">Portfolio · {year}</span>
          </div>
          <div className="portrait-meta">
            <span>{profile.name}</span>
            <span>{profile.location ?? "Resume & portfolio"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
