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
      <div className="content-width contact-grid">
        <div>
          <p className="eyebrow">Have something in mind?</p>
          <h2 id="contact-heading" className="section-heading">
            Let's connect.
          </h2>
          <p className="section-description">
            Start a conversation about data, technology, or an opportunity to
            work together.
          </p>
          {email && (
            <Button asChild size="lg" className="mt-6">
              <a href={`mailto:${email}`}>
                <Mail size={17} aria-hidden="true" />
                Say hello
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </Button>
          )}
        </div>
        <div className="contact-details">
          {email && (
            <a href={`mailto:${email}`}>
              <Mail size={18} aria-hidden="true" />
              <span>{email}</span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          )}
          {phone && (
            <a href={`tel:${phone.replace(/[^+0-9]/g, "")}`}>
              <Phone size={18} aria-hidden="true" />
              <span>{phone}</span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          )}
          <div className="contact-socials">
            {links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            ))}
          </div>
          {!email && !phone && !links.length && (
            <p className="section-description">
              Contact details will be added here.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
