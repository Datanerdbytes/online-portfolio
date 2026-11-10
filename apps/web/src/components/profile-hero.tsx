import Image from "next/image";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SocialLinks } from "@/components/social-links";
import type { ApiProfile } from "@/lib/api";
import { profileImageUrl, BANNER_PATH, initialsFromName } from "@/lib/avatar";

export function ProfileHero({
  profile,
  email,
  links = [],
  resumeHref = "/resume",
}: {
  profile: ApiProfile;
  email: string | null;
  links?: { label: string; url: string }[];
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
  const contactHref = email ? `mailto:${email}` : "/contact";

  return (
    <section id="about" aria-labelledby="intro-heading" className="hero">
      <div className="content-width hero-grid">
        <div className="hero-copy">
          <p className="hero-kicker">Hi, I am</p>
          <h1 id="intro-heading" className="hero-name">
            {profile.name}
          </h1>
          <p className="hero-headline">{profile.headline}</p>
          <SocialLinks links={links} className="hero-socials" />
          <p className="hero-description">{profile.introduction}</p>
          <div className="hero-actions">
            <Button asChild size="lg" className="hero-button">
              <a href={contactHref}>
                Get in touch
                <span aria-hidden="true">→</span>
              </a>
            </Button>
            <Button asChild variant="outline" size="lg" className="hero-button">
              <Link href={resumeHref}>
                <FileText size={15} aria-hidden="true" />
                Read resume
              </Link>
            </Button>
          </div>
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
          </div>
        </div>
      </div>
    </section>
  );
}
