import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

export function AuthPanel({
  title,
  description,
  children,
  footer,
  status = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  status?: boolean;
}) {
  return (
    <section className="auth-section" aria-labelledby="auth-heading">
      <div className="auth-container">
        <div className="auth-panel">
          <div className="auth-panel-body">
            <p className="auth-brand">
              <FileText size={17} aria-hidden="true" />
              Your portfolio workspace
            </p>
            <h1 id="auth-heading">{title}</h1>
            <p
              className="auth-description"
              role={status ? "status" : undefined}
            >
              {description}
            </p>
            <div className="auth-content">{children}</div>
          </div>
          {footer ? <div className="auth-panel-footer">{footer}</div> : null}
        </div>
        <Link href="/" className="auth-back-link">
          <ArrowLeft size={15} aria-hidden="true" />
          Back to personal portfolio
        </Link>
      </div>
    </section>
  );
}

export function AuthFeedback({
  message,
  failed = false,
}: {
  message: string;
  failed?: boolean;
}) {
  return (
    <p
      role={failed ? "alert" : "status"}
      className={`auth-feedback${failed ? " auth-feedback-error" : ""}`}
    >
      {message}
    </p>
  );
}
