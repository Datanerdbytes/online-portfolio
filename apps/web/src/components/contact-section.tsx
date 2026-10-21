import { ArrowUpRight, Mail, Phone } from "lucide-react";
import { resume } from "@/content/resume";
import { isAbsoluteHttpUrl } from "@/lib/resume";
import { Button } from "@/components/ui/button";

export function ContactSection() {
  const { email, phone, links = [] } = resume.contact;
  const validLinks = links.filter((link) => isAbsoluteHttpUrl(link.url));
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
            Let’s connect.
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
            {validLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            ))}
          </div>
          {!email && !phone && !validLinks.length && (
            <p className="section-description">
              Contact details will be added here.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
