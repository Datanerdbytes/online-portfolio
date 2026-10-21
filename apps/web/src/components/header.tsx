"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CodeXml,
  GraduationCap,
  Mail,
  Menu,
  UserRound,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const navigation = [
  { id: "about", label: "About me", icon: UserRound },
  { id: "skills", label: "Skills & tools", icon: CodeXml },
  { id: "projects", label: "Portfolio", icon: ChartNoAxesCombined },
  { id: "experience", label: "Experience", icon: BriefcaseBusiness },
  { id: "education", label: "Education", icon: GraduationCap },
  { id: "contact", label: "Contact", icon: Mail },
];

type HeaderProps = {
  name: string;
  headline: string;
  isSample: boolean;
  email?: string;
  links: { label: string; url: string }[];
};

/** Shows an Admin link only when the session cookie is present. */
function AdminLink() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hasSession = document.cookie
      .split(";")
      .some(
        (c) =>
          c.trim().startsWith("portfolio-admin=") ||
          c.trim().startsWith("__Host-portfolio-admin="),
      );
    setShow(hasSession);
  }, []);
  if (!show) return null;
  return (
    <Link
      href="/admin/resume"
      aria-label="Admin panel"
      title="Admin panel"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        fontSize: "0.65rem",
        fontWeight: 600,
        lineHeight: 1,
        padding: "2px 5px",
        borderRadius: "4px",
        background: "var(--primary)",
        color: "var(--primary-foreground)",
        textDecoration: "none",
        letterSpacing: "0.04em",
      }}
    >
      ADMIN
    </Link>
  );
}

export function Header({
  name,
  headline,
  isSample,
  email,
  links,
}: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("about");
  const menuButton = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && open) {
        setOpen(false);
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
      { rootMargin: "-15% 0px -55% 0px" },
    );
    navigation.forEach(({ id }) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <header className="sidebar">
      <div className="sidebar-top">
        <Link
          href="/#about"
          className="sidebar-name"
          onClick={() => setOpen(false)}
        >
          {name}
          <span className="sidebar-name-dot">.</span>
        </Link>
        <button
          ref={menuButton}
          type="button"
          className="mobile-menu"
          aria-label={open ? "Close main menu" : "Open main menu"}
          aria-expanded={open}
          aria-controls="sidebar-content"
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <X size={22} aria-hidden="true" />
          ) : (
            <Menu size={22} aria-hidden="true" />
          )}
        </button>
      </div>
      <div
        id="sidebar-content"
        className={`sidebar-content ${open ? "is-open" : ""}`}
      >
        <div className="sidebar-profile">
          <div className="sidebar-profile-top">
            <div className="profile-monogram" aria-hidden="true">
              {initials}
            </div>
            <AdminLink />
          </div>
          <p className="sidebar-headline">{headline}</p>
          {isSample && <p className="sidebar-sample">Placeholder profile</p>}
          <div className="sidebar-socials">
            {links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
                <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
        <nav aria-label="Main" className="sidebar-nav">
          {navigation.map(({ id, label, icon: Icon }) => (
            <Link
              key={id}
              href={`/#${id}`}
              aria-current={
                pathname === "/" && active === id ? "location" : undefined
              }
              onClick={() => {
                setOpen(false);
                setActive(id);
              }}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        {email && (
          <a className="sidebar-contact" href={`mailto:${email}`}>
            <Mail size={17} aria-hidden="true" />
            Get in touch
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        )}
        <div className="sidebar-bottom">
          <ThemeToggle />
          <p>
            Thoughtfully built with
            <br />
            Next.js & FastAPI
          </p>
        </div>
      </div>
    </header>
  );
}
