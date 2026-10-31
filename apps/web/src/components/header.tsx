"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Menu, X } from "lucide-react";
import {
  faDiscord,
  faGithub,
  faSlack,
} from "@fortawesome/free-brands-svg-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProfileAvatar } from "@/components/profile-avatar";
import { profileImageUrl } from "@/lib/avatar";

type SocialBrand = "github" | "tableau" | "slack" | "discord";

const BRAND_ICONS = {
  github: faGithub,
  slack: faSlack,
  discord: faDiscord,
} as const;

const SOCIAL_PLACEHOLDERS: { label: string; brand: SocialBrand }[] = [
  { label: "Slack", brand: "slack" },
  { label: "Discord", brand: "discord" },
];

function identifySocialBrand(label: string, url: string): SocialBrand | null {
  const normalizedLabel = label.toLowerCase();
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    // Unknown or malformed destinations retain their text label.
  }

  if (
    normalizedLabel.includes("github") ||
    hostname === "github.com" ||
    hostname.endsWith(".github.com")
  )
    return "github";
  if (
    normalizedLabel.includes("tableau") ||
    hostname === "tableau.com" ||
    hostname.endsWith(".tableau.com")
  )
    return "tableau";
  if (
    normalizedLabel.includes("slack") ||
    hostname === "slack.com" ||
    hostname.endsWith(".slack.com")
  )
    return "slack";
  if (
    normalizedLabel.includes("discord") ||
    hostname === "discord.com" ||
    hostname.endsWith(".discord.com") ||
    hostname === "discord.gg" ||
    hostname.endsWith(".discord.gg")
  )
    return "discord";
  return null;
}

function SocialMark({ brand }: { brand: SocialBrand }) {
  if (brand === "tableau") {
    return (
      <Image
        className="masthead-social-tableau"
        src="/brands/tableau.png"
        alt=""
        width={24}
        height={24}
        aria-hidden="true"
      />
    );
  }

  const icon = BRAND_ICONS[brand];
  const [width, height, , , pathData] = icon.icon;
  const paths = Array.isArray(pathData) ? pathData : [pathData];
  return (
    <svg
      className="masthead-social-mark"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((path, index) => (
        <path d={path} key={index} />
      ))}
    </svg>
  );
}

type SocialLink = {
  label: string;
  url: string | null;
  brand: SocialBrand | null;
};

function SocialLinks({ links }: { links: { label: string; url: string }[] }) {
  const configured: SocialLink[] = links.map((link) => ({
    ...link,
    brand: identifySocialBrand(link.label, link.url),
  }));
  const configuredBrands = new Set(
    configured.flatMap((link) => (link.brand ? [link.brand] : []))
  );
  const items: SocialLink[] = [
    ...configured,
    ...SOCIAL_PLACEHOLDERS.filter(
      ({ brand }) => !configuredBrands.has(brand)
    ).map(({ label, brand }) => ({ label, url: null, brand })),
  ];

  return (
    <div role="group" aria-label="Social profiles" className="masthead-socials">
      {items.map((link) =>
        link.url ? (
          <a
            key={link.url}
            className="masthead-social-link"
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            title={link.label}
          >
            {link.brand ? (
              <SocialMark brand={link.brand} />
            ) : (
              <span>{link.label}</span>
            )}
          </a>
        ) : (
          <span
            key={link.label}
            className="masthead-social-link is-placeholder"
            role="img"
            aria-label={`${link.label} link not configured`}
            title={`${link.label} link not configured`}
          >
            {link.brand && <SocialMark brand={link.brand} />}
          </span>
        )
      )}
    </div>
  );
}

const navigation = [
  { id: "about", label: "About", href: "/about" },
  { id: "skills", label: "Skills", href: "/skills" },
  { id: "projects", label: "Work", href: "/projects" },
  { id: "experience", label: "Experience", href: "/experience" },
  { id: "education", label: "Education", href: "/education" },
  { id: "resume", label: "Resume", href: "/resume" },
  { id: "contact", label: "Contact", href: "/contact" },
];

type HeaderProps = {
  name: string;
  email?: string;
  links: { label: string; url: string }[];
  avatarUrl?: string | null;
  avatarUpdatedAt?: string | null;
};

export function Header({
  name,
  email,
  links,
  avatarUrl,
  avatarUpdatedAt,
}: HeaderProps) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [active, setActive] = useState("about");
  const menuButton = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const open = openPath === pathname;
  const avatarSrc = profileImageUrl(avatarUrl, avatarUpdatedAt);
  const contactHref = email ? `mailto:${email}` : "/contact";

  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && open) {
        setOpenPath(null);
        menuButton.current?.focus();
      }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);

  useEffect(() => {
    if (pathname !== "/") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length) setActive(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -55% 0px" }
    );
    navigation.forEach(({ id }) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, [pathname]);

  function isCurrent(id: string) {
    if (id === "resume") return pathname === "/resume";
    if (pathname === "/") return active === id;
    return pathname === `/${id}`;
  }

  const contactLabel = email ? "Email me" : "Get in touch";

  return (
    <header className="masthead">
      <div className="content-width masthead-inner">
        <Link href="/" className="wordmark" onClick={() => setOpenPath(null)}>
          <ProfileAvatar
            src={avatarSrc}
            alt=""
            name={name}
            size="xs"
            lazy={false}
          />
          <span className="wordmark-name">
            {name}
            <span className="wordmark-dot">.</span>
          </span>
        </Link>

        <nav aria-label="Main" className="masthead-nav">
          {navigation.map(({ id, label, href }) => (
            <Link
              key={id}
              href={href}
              aria-current={isCurrent(id) ? "location" : undefined}
              onClick={() => setActive(id)}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="masthead-actions">
          <SocialLinks links={links} />
          <ThemeToggle />
          <a className="masthead-cta" href={contactHref}>
            {contactLabel}
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
          <button
            ref={menuButton}
            type="button"
            className="masthead-menu-button"
            aria-label={open ? "Close main menu" : "Open main menu"}
            aria-expanded={open}
            aria-controls="masthead-panel"
            onClick={() => setOpenPath(open ? null : pathname)}
          >
            {open ? (
              <X size={20} aria-hidden="true" />
            ) : (
              <Menu size={20} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div
        id="masthead-panel"
        className={`content-width masthead-panel ${open ? "is-open" : ""}`}
      >
        <nav aria-label="Main menu">
          {navigation.map(({ id, label, href }) => (
            <Link
              key={id}
              href={href}
              aria-current={isCurrent(id) ? "location" : undefined}
              onClick={() => {
                setOpenPath(null);
                setActive(id);
              }}
            >
              {label}
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          ))}
        </nav>
        <a className="masthead-cta" href={contactHref}>
          {contactLabel}
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
        <SocialLinks links={links} />
      </div>
    </header>
  );
}
