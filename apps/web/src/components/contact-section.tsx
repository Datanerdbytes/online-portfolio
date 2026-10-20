import { resume } from "@/content/resume";
import { isAbsoluteHttpUrl } from "@/lib/resume";

export function ContactSection() {
  const { email, links = [] } = resume.contact;
  const validLinks = links.filter((link) => isAbsoluteHttpUrl(link.url));
  const hasContact = Boolean(email) || validLinks.length > 0;

  return (
    <section id="contact" aria-labelledby="contact-heading" className="py-12 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="max-w-lg">
          <h2 id="contact-heading" className="text-2xl sm:text-3xl font-bold tracking-tight">
            Contact
          </h2>
          {hasContact ? (
            <div className="mt-4 space-y-2">
              {email && (
                <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] sm:gap-4">
                  <span className="min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    Email
                  </span>
                  <a
                    href={`mailto:${email}`}
                    className="min-w-0 text-sm [overflow-wrap:anywhere] text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {email}
                  </a>
                </div>
              )}
              {validLinks.map((link) => (
                <div
                  key={link.label}
                  className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] sm:gap-4"
                >
                  <span className="min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    {link.label}
                  </span>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 text-sm [overflow-wrap:anywhere] text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {link.label}
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-lg text-muted-foreground">
              No contact details provided.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
