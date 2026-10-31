"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProfileAvatar } from "@/components/profile-avatar";
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
  avatarUrl?: string | null;
  avatarUpdatedAt?: string | null;
};

export function Header({
  name,
  email,
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
      </div>
    </header>
  );
}
