"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CodeXml,
  FileText,
  GraduationCap,
  Mail,
  Menu,
  UserRound,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProfileAvatar } from "@/components/profile-avatar";
import { profileImageUrl } from "@/lib/avatar";

const navigation = [
  { id: "about", label: "About me", icon: UserRound, href: "/#about" },
  { id: "skills", label: "Skills & tools", icon: CodeXml, href: "/#skills" },
  {
    id: "projects",
    label: "Portfolio",
    icon: ChartNoAxesCombined,
    href: "/#projects",
  },
  {
    id: "experience",
    label: "Experience",
    icon: BriefcaseBusiness,
    href: "/#experience",
  },
  {
    id: "education",
    label: "Education",
    icon: GraduationCap,
    href: "/#education",
  },
  { id: "resume", label: "Resume", icon: FileText, href: "/resume" },
  { id: "contact", label: "Contact", icon: Mail, href: "/#contact" },
];

type HeaderProps = {
  name: string;
  headline: string;
  isSample: boolean;
  email?: string;
  links: { label: string; url: string }[];
  avatarUrl?: string | null;
  avatarUpdatedAt?: string | null;
};

export function Header({
  name,
  headline,
  isSample,
  email,
  links,
  avatarUrl,
  avatarUpdatedAt,
}: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("about");
  const menuButton = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const avatarSrc = profileImageUrl(avatarUrl, avatarUpdatedAt);

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
      { rootMargin: "-15% 0px -55% 0px" }
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
            <ProfileAvatar
              src={avatarSrc}
              alt=""
              name={name}
              size="sm"
              lazy={false}
            />
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
              </a>
            ))}
          </div>
        </div>
        <nav aria-label="Main" className="sidebar-nav">
          {navigation.map(({ id, label, icon: Icon, href }) => (
            <Link
              key={id}
              href={href}
              aria-current={
                id === "resume"
                  ? pathname === "/resume"
                    ? "location"
                    : undefined
                  : pathname === "/" && active === id
                    ? "location"
                    : undefined
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
