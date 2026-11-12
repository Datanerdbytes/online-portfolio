"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProfileAvatar } from "@/components/profile-avatar";
import { SocialLinks } from "@/components/social-links";
import { profileImageUrl } from "@/lib/avatar";

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

    // The homepage streams its sections (Suspense fallbacks swap in streamed
    // content after mount), so a node reference captured once can end up
    // detached. Resolve the sections by id on every update instead.
    const lastId = navigation[navigation.length - 1].id;
    let frame = 0;

    function update() {
      frame = 0;
      const probe = window.innerHeight * 0.4;
      let current = "about";
      for (const { id } of navigation) {
        if (id === "resume") continue; // separate page, no homepage section
        const section = document.getElementById(id);
        if (!section) continue;
        if (section.getBoundingClientRect().top <= probe) current = id;
      }
      const documentElement = document.documentElement;
      if (
        window.innerHeight + window.scrollY >=
        documentElement.scrollHeight - 1
      ) {
        current = lastId;
      }
      setActive(current);
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
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
          <span className="wordmark-name">{name}</span>
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
