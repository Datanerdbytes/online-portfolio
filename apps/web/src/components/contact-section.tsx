import { ArrowUpRight, Mail, Phone } from "lucide-react";
import type { ApiContact } from "@/lib/api";
import { isAbsoluteHttpUrl } from "@/lib/resume";
import { Button } from "@/components/ui/button";

type Props = {
  contact: ApiContact | null;
};

export function ContactSection({ contact }: Props) {
  const email = contact?.email ?? null;
  const phone = contact?.phone ?? null;
  const links = (contact?.links ?? []).filter((l) => isAbsoluteHttpUrl(l.url));

  return (
    <section
      id="contact"
      aria-labelledby="contact-heading"
      className="portfolio-section"
    >
      <div className="content-width">
        <div className="contact-panel">
          <div>
            <p className="contact-eyebrow">05 — Contact</p>
            <h2 id="contact-heading" className="contact-title">
              Let&apos;s connect.
            </h2>
            <p className="contact-description">
              Start a conversation about data, technology, or an opportunity to
              work together.
            </p>
            {email && (
              <div className="contact-actions">
                <Button asChild className="contact-button">
                  <a href={`mailto:${email}`}>
                    <Mail size={15} aria-hidden="true" />
                    Say hello
                  </a>
                </Button>
              </div>
            )}
          </div>
          <div className="contact-list">
            {email && (
              <a className="contact-row" href={`mailto:${email}`}>
                <span className="contact-row-label">Email</span>
                <span className="contact-row-value">
                  {email}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </span>
              </a>
            )}
            {phone && (
              <a
                className="contact-row"
                href={`tel:${phone.replace(/[^+0-9]/g, "")}`}
              >
                <span className="contact-row-label">Phone</span>
                <span className="contact-row-value">
                  {phone}
                  <Phone size={14} aria-hidden="true" />
                </span>
              </a>
            )}
            {links.map((link) => (
              <a
                className="contact-row"
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="contact-row-label">Elsewhere</span>
                <span className="contact-row-value">
                  {link.label}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </span>
              </a>
            ))}
            {!email && !phone && !links.length && (
              <p className="contact-empty">
                Contact details will be added here.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
